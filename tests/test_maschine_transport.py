from __future__ import annotations

from types import SimpleNamespace

from app.services.maschine.transport import (
    MaschineTransportController,
    PyUsbBulkMaschineTransport,
    _parse_usb_descriptor_blob,
)
import app.services.maschine.transport as maschine_transport_module


class _FakeAdapter:
    def __init__(self, transport_id: str, *, connect_result: bool, probe_connectable: bool = False) -> None:
        self.transport_id = transport_id
        self._connect_result = connect_result
        self._probe_connectable = probe_connectable
        self.connected = False

    def probe(self) -> dict[str, object]:
        return {
            "transport_id": self.transport_id,
            "module_available": True,
            "connectable": self._probe_connectable,
        }

    def connect(self) -> tuple[bool, dict[str, object]]:
        self.connected = self._connect_result
        return self._connect_result, {
            "transport_id": self.transport_id,
            "connectable": self._connect_result,
            "connected": self._connect_result,
        }

    def disconnect(self) -> None:
        self.connected = False

    def read_report(self, *, max_length: int = 64, timeout_ms: int = 2) -> bytes | None:
        if not self.connected:
            return None
        return bytes([0x01, max_length & 0x7F, timeout_ms & 0x7F])

    def write_reports(self, reports):  # type: ignore[no-untyped-def]
        return self.connected and bool(list(reports))


class _FakeEndpoint:
    def __init__(self, address: int, *, attributes: int = 2) -> None:
        self.bEndpointAddress = address
        self.bmAttributes = attributes
        self.wMaxPacketSize = 0x0200
        self.bInterval = 0


class _FakeInterface:
    def __init__(self, number: int, alternate_setting: int, endpoints: list[_FakeEndpoint]) -> None:
        self.bInterfaceNumber = number
        self.bAlternateSetting = alternate_setting
        self.bInterfaceClass = 0xFF
        self.bInterfaceSubClass = 0xFF
        self.bInterfaceProtocol = 0x00
        self._endpoints = endpoints

    def endpoints(self) -> list[_FakeEndpoint]:
        return list(self._endpoints)


class _FakeUsbDevice:
    def __init__(self, interfaces: list[_FakeInterface]) -> None:
        self._interfaces = interfaces

    def get_active_configuration(self) -> list[_FakeInterface]:
        return list(self._interfaces)

    def is_kernel_driver_active(self, _interface_number: int) -> bool:
        return False


def test_transport_controller_prefers_hidapi_in_auto_mode_when_available():
    controller = MaschineTransportController(vendor_id=0x17CC, product_id=0x0808, preference="auto")
    controller._hidapi = _FakeAdapter("hidapi", connect_result=True, probe_connectable=True)  # type: ignore[assignment]
    controller._pyusb = _FakeAdapter("pyusb-bulk", connect_result=False, probe_connectable=False)  # type: ignore[assignment]

    connected, runtime_info = controller.connect()

    assert connected is True
    assert runtime_info["transport_id"] == "hidapi"
    assert controller.read_report() == bytes([0x01, 64 & 0x7F, 2 & 0x7F])


def test_transport_controller_falls_back_to_pyusb_when_hidapi_fails():
    controller = MaschineTransportController(vendor_id=0x17CC, product_id=0x0808, preference="auto")
    controller._hidapi = _FakeAdapter("hidapi", connect_result=False, probe_connectable=False)  # type: ignore[assignment]
    controller._pyusb = _FakeAdapter("pyusb-bulk", connect_result=True, probe_connectable=True)  # type: ignore[assignment]

    connected, runtime_info = controller.connect()

    assert connected is True
    assert runtime_info["transport_id"] == "pyusb-bulk"
    assert runtime_info["selected_transport"]["transport_id"] == "pyusb-bulk"


def test_descriptor_parser_extracts_mk1_alternate_setting_bulk_layout():
    descriptor_blob = bytes.fromhex(
        "12010002ffffff40cc1708080d0001020501"
        "09024500010100808c"
        "0904000002ffff0003"
        "07050102000200"
        "07058102000200"
        "0904000104ffff0004"
        "07050102000200"
        "07058102000200"
        "07058402000201"
        "07050802000201"
    )

    configurations = _parse_usb_descriptor_blob(descriptor_blob)

    assert len(configurations) == 1
    interfaces = configurations[0]["interfaces"]
    assert [interface["alternate_setting"] for interface in interfaces] == [0, 1]
    assert [endpoint["address_hex"] for endpoint in interfaces[0]["endpoints"]] == ["0x01", "0x81"]
    assert [endpoint["address_hex"] for endpoint in interfaces[1]["endpoints"]] == ["0x01", "0x81", "0x84", "0x08"]


def test_pyusb_bulk_endpoint_resolution_prefers_richer_alternate_setting(monkeypatch):
    monkeypatch.setattr(
        maschine_transport_module,
        "usb_util",
        SimpleNamespace(
            endpoint_type=lambda value: value,
            endpoint_direction=lambda value: value & 0x80,
            ENDPOINT_TYPE_BULK=2,
            ENDPOINT_IN=0x80,
            ENDPOINT_OUT=0x00,
        ),
    )

    transport = PyUsbBulkMaschineTransport(vendor_id=0x17CC, product_id=0x0808)
    endpoint_info = transport._resolve_bulk_endpoints(
        _FakeUsbDevice(
            [
                _FakeInterface(0, 0, [_FakeEndpoint(0x01), _FakeEndpoint(0x81)]),
                _FakeInterface(0, 1, [_FakeEndpoint(0x01), _FakeEndpoint(0x81), _FakeEndpoint(0x84), _FakeEndpoint(0x08)]),
            ]
        )
    )

    assert endpoint_info is not None
    assert endpoint_info["alternate_setting"] == 1
    assert endpoint_info["write_endpoint_address"] == 0x08
    assert endpoint_info["read_endpoint_address"] == 0x84


def test_pyusb_probe_reports_host_preferred_pair_without_pyusb(monkeypatch):
    monkeypatch.setattr(maschine_transport_module, "usb_core", None)
    monkeypatch.setattr(maschine_transport_module, "usb_util", None)
    monkeypatch.setattr(
        maschine_transport_module,
        "probe_sysfs_usb_device",
        lambda vendor_id, product_id: {
            "vendor_id": f"{vendor_id:04x}",
            "product_id": f"{product_id:04x}",
            "interfaces": [{"name": "2-3.4.2:1.0"}],
            "preferred_bulk_pair": {
                "interface_number": 0,
                "alternate_setting": 1,
                "write_endpoint_address_hex": "0x08",
                "read_endpoint_address_hex": "0x84",
            },
        },
    )

    payload = PyUsbBulkMaschineTransport(vendor_id=0x17CC, product_id=0x0808).probe()

    assert payload["device_visible"] is True
    assert payload["preferred_endpoint_pair"]["write_endpoint_address_hex"] == "0x08"
    assert "0x84" in str(payload["note"])


def test_pyusb_probe_does_not_leak_endpoint_objects(monkeypatch):
    monkeypatch.setattr(maschine_transport_module, "usb_core", object())
    monkeypatch.setattr(
        maschine_transport_module,
        "usb_util",
        SimpleNamespace(
            endpoint_type=lambda value: value,
            endpoint_direction=lambda value: value,
            ENDPOINT_TYPE_BULK=2,
            ENDPOINT_IN=0x80,
            ENDPOINT_OUT=0x00,
        ),
    )

    transport = PyUsbBulkMaschineTransport(vendor_id=0x17CC, product_id=0x0808)
    monkeypatch.setattr(transport, "_find_device", lambda: object())
    monkeypatch.setattr(
        transport,
        "_resolve_bulk_endpoints",
        lambda device: {
            "interface_number": 1,
            "kernel_driver_active": False,
            "read_endpoint_address": 0x81,
            "write_endpoint_address": 0x01,
            "read_endpoint": object(),
            "write_endpoint": object(),
        },
    )

    payload = transport.probe()

    assert payload["connectable"] is True
    assert "read_endpoint" not in payload
    assert "write_endpoint" not in payload
