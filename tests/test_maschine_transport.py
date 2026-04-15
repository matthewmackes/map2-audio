from __future__ import annotations

from types import SimpleNamespace

from app.services.maschine.mk1_protocol import (
    LED_DATA_SIZE,
    LED_GROUP_SIZE,
    build_led_packets,
)
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
        self.read_calls: list[tuple[int, int]] = []
        self.write_calls: list[bytes] = []

    def read(self, max_length: int, *, timeout: int):
        self.read_calls.append((max_length, timeout))
        return bytes([(self.bEndpointAddress & 0xFF), max_length & 0xFF, timeout & 0xFF])

    def write(self, payload: bytes) -> int:
        encoded = bytes(payload)
        self.write_calls.append(encoded)
        return len(encoded)


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
        self.detached_interfaces: list[int] = []
        self.attached_interfaces: list[int] = []
        self.altsetting_calls: list[tuple[int, int]] = []

    def get_active_configuration(self) -> list[_FakeInterface]:
        return list(self._interfaces)

    def is_kernel_driver_active(self, _interface_number: int) -> bool:
        return False

    def detach_kernel_driver(self, interface_number: int) -> None:
        self.detached_interfaces.append(interface_number)

    def attach_kernel_driver(self, interface_number: int) -> None:
        self.attached_interfaces.append(interface_number)

    def set_interface_altsetting(self, *, interface: int, alternate_setting: int) -> None:
        self.altsetting_calls.append((interface, alternate_setting))


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


def test_build_led_packets_splits_full_led_array_into_two_control_packets():
    led_state = list(range(LED_DATA_SIZE))

    group0, group1 = build_led_packets(led_state)

    assert len(group0) == 2 + LED_GROUP_SIZE
    assert len(group1) == 2 + LED_GROUP_SIZE
    assert group0[:2] == bytes([0x0C, 0x00])
    assert group1[:2] == bytes([0x0C, 0x1E])
    assert group0[2:] == bytes(range(LED_GROUP_SIZE))
    assert group1[2:] == bytes(range(LED_GROUP_SIZE, LED_DATA_SIZE))


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
            "preferred_interface_driver": "snd-usb-caiaq",
            "preferred_bulk_pair": {
                "interface_number": 0,
                "alternate_setting": 1,
                "write_endpoint_address_hex": "0x08",
                "read_endpoint_address_hex": "0x84",
            },
            "device_node": {
                "path": "/dev/bus/usb/002/029",
                "exists": True,
                "mode_octal": "0o664",
                "owner_name": "root",
                "group_name": "root",
                "current_uid": 1000,
                "current_user_can_access": False,
            },
        },
    )

    payload = PyUsbBulkMaschineTransport(vendor_id=0x17CC, product_id=0x0808).probe()

    assert payload["device_visible"] is True
    assert payload["access_blocked"] is True
    assert payload["device_node"]["path"] == "/dev/bus/usb/002/029"
    assert payload["preferred_endpoint_pair"]["write_endpoint_address_hex"] == "0x08"
    assert "snd-usb-caiaq" in str(payload["note"])
    assert "0o664" in str(payload["note"])
    assert "descriptor-only fallback" in str(payload["note"])
    assert "0x84" in str(payload["note"])


def test_pyusb_probe_reports_access_block_reason_when_device_node_is_unavailable(monkeypatch):
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
    monkeypatch.setattr(
        maschine_transport_module,
        "probe_sysfs_usb_device",
        lambda vendor_id, product_id: {
            "vendor_id": f"{vendor_id:04x}",
            "product_id": f"{product_id:04x}",
            "interfaces": [{"name": "2-3.4.2:1.0"}],
            "preferred_interface_driver": "snd-usb-caiaq",
            "preferred_bulk_pair": {
                "interface_number": 0,
                "alternate_setting": 1,
                "write_endpoint_address_hex": "0x08",
                "read_endpoint_address_hex": "0x84",
            },
            "device_node": {
                "path": "/dev/bus/usb/002/029",
                "exists": True,
                "mode_octal": "0o664",
                "owner_name": "root",
                "group_name": "root",
                "current_uid": 1000,
                "current_user_can_access": False,
            },
        },
    )

    transport = PyUsbBulkMaschineTransport(vendor_id=0x17CC, product_id=0x0808, allow_kernel_detach=True)
    monkeypatch.setattr(transport, "_find_device", lambda: object())
    monkeypatch.setattr(
        transport,
        "_resolve_bulk_endpoints",
        lambda device: {
            "interface_number": 0,
            "alternate_setting": 1,
            "kernel_driver_active": False,
            "read_endpoint_address": 0x84,
            "read_endpoint_address_hex": "0x84",
            "write_endpoint_address": 0x08,
            "write_endpoint_address_hex": "0x08",
        },
    )

    payload = transport.probe()
    connected, connect_info = transport.connect()

    assert payload["connectable"] is False
    assert payload["access_blocked"] is True
    assert "lacks direct read/write access" in str(payload["note"])
    assert connected is False
    assert connect_info["error"] == "device node access denied"


def test_pyusb_probe_connectable_when_access_is_available_and_kernel_detach_is_allowed(monkeypatch):
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
    monkeypatch.setattr(
        maschine_transport_module,
        "probe_sysfs_usb_device",
        lambda vendor_id, product_id: {
            "vendor_id": f"{vendor_id:04x}",
            "product_id": f"{product_id:04x}",
            "interfaces": [{"name": "2-3.4.2:1.0"}],
            "preferred_interface_driver": "snd-usb-caiaq",
            "preferred_bulk_pair": {
                "interface_number": 0,
                "alternate_setting": 1,
                "write_endpoint_address_hex": "0x08",
                "read_endpoint_address_hex": "0x84",
            },
            "device_node": {
                "path": "/dev/bus/usb/002/029",
                "exists": True,
                "mode_octal": "0o660",
                "owner_name": "root",
                "group_name": "audio",
                "current_uid": 1000,
                "current_user_can_access": True,
            },
        },
    )

    transport = PyUsbBulkMaschineTransport(vendor_id=0x17CC, product_id=0x0808, allow_kernel_detach=True)
    monkeypatch.setattr(transport, "_find_device", lambda: object())
    monkeypatch.setattr(
        transport,
        "_resolve_bulk_endpoints",
        lambda device: {
            "interface_number": 0,
            "alternate_setting": 1,
            "kernel_driver_active": True,
            "read_endpoint_address": 0x84,
            "read_endpoint_address_hex": "0x84",
            "write_endpoint_address": 0x08,
            "write_endpoint_address_hex": "0x08",
        },
    )

    payload = transport.probe()

    assert payload["access_blocked"] is False
    assert payload["connectable"] is True
    assert payload["alternate_setting"] == 1
    assert payload["write_endpoint_address_hex"] == "0x08"
    assert payload["read_endpoint_address_hex"] == "0x84"
    assert payload["note"] == "Preferred bulk alt 1 OUT 0x08 IN 0x84."


def test_pyusb_connect_detaches_claims_and_reattaches_kernel_driver(monkeypatch):
    claim_calls: list[tuple[object, int]] = []
    release_calls: list[tuple[object, int]] = []

    monkeypatch.setattr(maschine_transport_module, "usb_core", object())
    monkeypatch.setattr(
        maschine_transport_module,
        "usb_util",
        SimpleNamespace(
            claim_interface=lambda device, interface_number: claim_calls.append((device, interface_number)),
            release_interface=lambda device, interface_number: release_calls.append((device, interface_number)),
        ),
    )
    monkeypatch.setattr(
        maschine_transport_module,
        "probe_sysfs_usb_device",
        lambda vendor_id, product_id: {
            "vendor_id": f"{vendor_id:04x}",
            "product_id": f"{product_id:04x}",
            "interfaces": [{"name": "2-3.4.2:1.0"}],
            "preferred_interface_driver": "snd-usb-caiaq",
            "preferred_bulk_pair": {
                "interface_number": 0,
                "alternate_setting": 1,
                "write_endpoint_address_hex": "0x08",
                "read_endpoint_address_hex": "0x84",
            },
            "device_node": {
                "path": "/dev/bus/usb/002/029",
                "exists": True,
                "mode_octal": "0o660",
                "owner_name": "root",
                "group_name": "audio",
                "current_uid": 1000,
                "current_user_can_access": True,
            },
        },
    )

    read_endpoint = _FakeEndpoint(0x84)
    write_endpoint = _FakeEndpoint(0x08)
    fake_device = _FakeUsbDevice([])
    transport = PyUsbBulkMaschineTransport(vendor_id=0x17CC, product_id=0x0808, allow_kernel_detach=True)
    monkeypatch.setattr(transport, "_find_device", lambda: fake_device)
    monkeypatch.setattr(
        transport,
        "_resolve_bulk_endpoints",
        lambda device: {
            "interface_number": 0,
            "alternate_setting": 1,
            "kernel_driver_active": True,
            "read_endpoint_address": 0x84,
            "read_endpoint_address_hex": "0x84",
            "write_endpoint_address": 0x08,
            "write_endpoint_address_hex": "0x08",
            "read_endpoint": read_endpoint,
            "write_endpoint": write_endpoint,
        },
    )

    connected, info = transport.connect()

    assert connected is True
    assert info["connected"] is True
    assert fake_device.detached_interfaces == [0]
    assert claim_calls == [(fake_device, 0)]
    assert fake_device.altsetting_calls == [(0, 1)]
    assert transport.read_report(max_length=64, timeout_ms=7) == bytes([0x84, 64, 7])
    assert transport.write_reports([b"\x01\x02"]) is True
    assert write_endpoint.write_calls == [b"\x01\x02"]

    transport.disconnect()

    assert release_calls == [(fake_device, 0)]
    assert fake_device.attached_interfaces == [0]


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
    monkeypatch.setattr(
        maschine_transport_module,
        "probe_sysfs_usb_device",
        lambda vendor_id, product_id: {
            "vendor_id": f"{vendor_id:04x}",
            "product_id": f"{product_id:04x}",
            "interfaces": [{"name": "2-3.4.2:1.0"}],
            "device_node": {
                "path": "/dev/bus/usb/002/029",
                "exists": True,
                "current_user_can_access": True,
            },
        },
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
