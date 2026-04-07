"""Maschine MK1 transport adapters and host-aware transport selection."""

from __future__ import annotations

import contextlib
import grp
import os
import pwd
import stat
from pathlib import Path
from typing import Any, Iterable

try:
    import hid  # type: ignore
except Exception:  # pragma: no cover - optional runtime dependency
    hid = None

try:
    import usb.core as usb_core  # type: ignore
    import usb.util as usb_util  # type: ignore
except Exception:  # pragma: no cover - optional runtime dependency
    usb_core = None  # type: ignore[assignment]
    usb_util = None  # type: ignore[assignment]

_USB_CONFIGURATION_DESCRIPTOR = 0x02
_USB_INTERFACE_DESCRIPTOR = 0x04
_USB_ENDPOINT_DESCRIPTOR = 0x05
_USB_TRANSFER_TYPE_NAMES = {
    0: "Control",
    1: "Isochronous",
    2: "Bulk",
    3: "Interrupt",
}


def _read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8").strip()
    except Exception:
        return None


def _parse_hex_int(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        return int(str(value).strip(), 16)
    except Exception:
        return None


def _format_endpoint_address(value: int | None) -> str | None:
    if value is None:
        return None
    return f"0x{int(value) & 0xFF:02x}"


def _probe_usb_device_node(busnum: str | None, devnum: str | None) -> dict[str, Any] | None:
    if busnum is None or devnum is None:
        return None
    try:
        device_path = Path("/dev/bus/usb") / f"{int(busnum):03d}" / f"{int(devnum):03d}"
    except Exception:
        return None
    payload: dict[str, Any] = {
        "path": str(device_path),
        "exists": device_path.exists(),
    }
    if not device_path.exists():
        return payload
    try:
        stats = device_path.stat()
    except Exception:
        return payload
    owner_name = None
    group_name = None
    with contextlib.suppress(KeyError):
        owner_name = pwd.getpwuid(stats.st_uid).pw_name
    with contextlib.suppress(KeyError):
        group_name = grp.getgrgid(stats.st_gid).gr_name
    readable = os.access(device_path, os.R_OK)
    writable = os.access(device_path, os.W_OK)
    payload.update(
        {
            "mode_octal": f"0o{stat.S_IMODE(stats.st_mode):03o}",
            "owner_uid": stats.st_uid,
            "owner_name": owner_name,
            "group_gid": stats.st_gid,
            "group_name": group_name,
            "current_uid": os.getuid(),
            "current_gid": os.getgid(),
            "current_groups": list(os.getgroups()),
            "readable": readable,
            "writable": writable,
            "current_user_can_access": readable and writable,
        }
    )
    return payload


def _read_endpoint_details(endpoint_dir: Path) -> dict[str, Any]:
    address = _parse_hex_int((endpoint_dir.name or "").split("_", 1)[-1])
    attributes = _parse_hex_int(_read_text(endpoint_dir / "bmAttributes"))
    interval = _read_text(endpoint_dir / "interval")
    max_packet_size = _parse_hex_int(_read_text(endpoint_dir / "wMaxPacketSize"))
    transfer_type = str(_read_text(endpoint_dir / "type") or _USB_TRANSFER_TYPE_NAMES.get((attributes or 0) & 0x03) or "unknown")
    return {
        "name": endpoint_dir.name,
        "address": address,
        "address_hex": _format_endpoint_address(address),
        "direction": str(_read_text(endpoint_dir / "direction") or "unknown"),
        "transfer_type": transfer_type,
        "max_packet_size": max_packet_size,
        "interval": interval,
    }


def _parse_usb_descriptor_blob(data: bytes) -> list[dict[str, Any]]:
    configurations: list[dict[str, Any]] = []
    current_configuration: dict[str, Any] | None = None
    current_interface: dict[str, Any] | None = None
    offset = 0
    total_length = len(data)
    while offset + 2 <= total_length:
        length = data[offset]
        descriptor_type = data[offset + 1]
        if length < 2 or offset + length > total_length:
            break
        chunk = data[offset : offset + length]
        if descriptor_type == _USB_CONFIGURATION_DESCRIPTOR and length >= 9:
            current_configuration = {
                "configuration_value": int(chunk[5]),
                "attributes": int(chunk[7]),
                "max_power_2ma_units": int(chunk[8]),
                "interfaces": [],
            }
            configurations.append(current_configuration)
            current_interface = None
        elif descriptor_type == _USB_INTERFACE_DESCRIPTOR and current_configuration is not None and length >= 9:
            current_interface = {
                "interface_number": int(chunk[2]),
                "alternate_setting": int(chunk[3]),
                "num_endpoints": int(chunk[4]),
                "class_code": int(chunk[5]),
                "subclass_code": int(chunk[6]),
                "protocol_code": int(chunk[7]),
                "string_index": int(chunk[8]),
                "endpoints": [],
            }
            current_configuration["interfaces"].append(current_interface)
        elif descriptor_type == _USB_ENDPOINT_DESCRIPTOR and current_interface is not None and length >= 7:
            endpoint_address = int(chunk[2])
            attributes = int(chunk[3])
            max_packet_size = int.from_bytes(chunk[4:6], "little")
            current_interface["endpoints"].append(
                {
                    "address": endpoint_address,
                    "address_hex": _format_endpoint_address(endpoint_address),
                    "direction": "in" if endpoint_address & 0x80 else "out",
                    "transfer_type": _USB_TRANSFER_TYPE_NAMES.get(attributes & 0x03, "unknown"),
                    "attributes": attributes,
                    "max_packet_size": max_packet_size,
                    "interval": int(chunk[6]),
                }
            )
        offset += length
    return configurations


def _candidate_selection_score(candidate: dict[str, Any]) -> tuple[int, int, int, int]:
    return (
        int(candidate.get("alternate_setting") or 0),
        len(candidate.get("endpoint_addresses", [])),
        int(candidate.get("write_endpoint_address") or 0),
        int(candidate.get("read_endpoint_address") or 0),
    )


def _select_preferred_bulk_pair(interface_descriptors: Iterable[dict[str, Any]]) -> dict[str, Any] | None:
    candidates: list[dict[str, Any]] = []
    for interface in interface_descriptors:
        endpoints = [
            dict(endpoint)
            for endpoint in interface.get("endpoints", [])
            if str(endpoint.get("transfer_type") or "").lower() == "bulk"
        ]
        bulk_in = sorted(
            (endpoint for endpoint in endpoints if str(endpoint.get("direction")) == "in"),
            key=lambda endpoint: int(endpoint.get("address") or 0),
        )
        bulk_out = sorted(
            (endpoint for endpoint in endpoints if str(endpoint.get("direction")) == "out"),
            key=lambda endpoint: int(endpoint.get("address") or 0),
        )
        if not bulk_in or not bulk_out:
            continue
        selected_in = bulk_in[-1]
        selected_out = bulk_out[-1]
        candidates.append(
            {
                "interface_number": int(interface.get("interface_number") or 0),
                "alternate_setting": int(interface.get("alternate_setting") or 0),
                "endpoint_addresses": [str(endpoint.get("address_hex") or "") for endpoint in endpoints],
                "endpoint_count": len(endpoints),
                "read_endpoint_address": int(selected_in.get("address") or 0),
                "read_endpoint_address_hex": str(selected_in.get("address_hex") or ""),
                "write_endpoint_address": int(selected_out.get("address") or 0),
                "write_endpoint_address_hex": str(selected_out.get("address_hex") or ""),
                "read_endpoint_candidates": [str(endpoint.get("address_hex") or "") for endpoint in bulk_in],
                "write_endpoint_candidates": [str(endpoint.get("address_hex") or "") for endpoint in bulk_out],
                "selection_reason": (
                    "Selected the highest-address bulk IN/OUT pair on the richest alternate setting."
                    if len(endpoints) > 2 or int(interface.get("alternate_setting") or 0) > 0
                    else "Selected the only bulk IN/OUT pair exposed by the interface."
                ),
            }
        )
    if not candidates:
        return None
    return max(candidates, key=_candidate_selection_score)


def probe_sysfs_usb_device(vendor_id: int, product_id: int) -> dict[str, Any]:
    expected_vendor = f"{vendor_id:04x}"
    expected_product = f"{product_id:04x}"
    root = Path("/sys/bus/usb/devices")
    for entry in sorted(root.glob("*")):
        if ":" in entry.name:
            continue
        if _read_text(entry / "idVendor") != expected_vendor or _read_text(entry / "idProduct") != expected_product:
            continue
        descriptor_configurations = _parse_usb_descriptor_blob((entry / "descriptors").read_bytes()) if (entry / "descriptors").exists() else []
        descriptor_interfaces = [
            dict(interface)
            for configuration in descriptor_configurations
            for interface in configuration.get("interfaces", [])
            if isinstance(interface, dict)
        ]
        interfaces: list[dict[str, Any]] = []
        for interface_dir in sorted(root.glob(f"{entry.name}:*")):
            driver_name = None
            with contextlib.suppress(Exception):
                driver_name = (interface_dir / "driver").resolve().name
            endpoint_details = [_read_endpoint_details(path) for path in sorted(interface_dir.glob("ep_*"))]
            interface_number = _parse_hex_int(_read_text(interface_dir / "bInterfaceNumber"))
            alternate_settings = [
                dict(interface)
                for interface in descriptor_interfaces
                if int(interface.get("interface_number") or -1) == int(interface_number or -1)
            ]
            interfaces.append(
                {
                    "name": interface_dir.name,
                    "number": _read_text(interface_dir / "bInterfaceNumber"),
                    "class_code": _read_text(interface_dir / "bInterfaceClass"),
                    "subclass_code": _read_text(interface_dir / "bInterfaceSubClass"),
                    "protocol_code": _read_text(interface_dir / "bInterfaceProtocol"),
                    "label": _read_text(interface_dir / "interface"),
                    "driver": driver_name,
                    "endpoints": [endpoint["name"] for endpoint in endpoint_details],
                    "endpoint_details": endpoint_details,
                    "alternate_settings": alternate_settings,
                    "preferred_bulk_pair": _select_preferred_bulk_pair(alternate_settings),
                }
            )
        busnum = _read_text(entry / "busnum")
        devnum = _read_text(entry / "devnum")
        preferred_bulk_pair = _select_preferred_bulk_pair(descriptor_interfaces)
        preferred_interface = None
        if isinstance(preferred_bulk_pair, dict):
            preferred_interface = next(
                (
                    interface
                    for interface in interfaces
                    if isinstance(interface.get("preferred_bulk_pair"), dict)
                    and int(interface["preferred_bulk_pair"].get("interface_number") or -1)
                    == int(preferred_bulk_pair.get("interface_number") or -1)
                    and int(interface["preferred_bulk_pair"].get("alternate_setting") or -1)
                    == int(preferred_bulk_pair.get("alternate_setting") or -1)
                ),
                None,
            )
        return {
            "vendor_id": expected_vendor,
            "product_id": expected_product,
            "manufacturer": _read_text(entry / "manufacturer"),
            "product": _read_text(entry / "product"),
            "serial_number": _read_text(entry / "serial"),
            "busnum": busnum,
            "devnum": devnum,
            "speed": _read_text(entry / "speed"),
            "sysfs_path": str(entry),
            "interfaces": interfaces,
            "device_node": _probe_usb_device_node(busnum, devnum),
            "preferred_bulk_pair": preferred_bulk_pair,
            "preferred_interface_name": preferred_interface.get("name") if isinstance(preferred_interface, dict) else None,
            "preferred_interface_driver": preferred_interface.get("driver") if isinstance(preferred_interface, dict) else None,
        }
    return {
        "vendor_id": expected_vendor,
        "product_id": expected_product,
        "interfaces": [],
    }


class HidApiMaschineTransport:
    transport_id = "hidapi"

    def __init__(self, *, vendor_id: int, product_id: int) -> None:
        self.vendor_id = vendor_id
        self.product_id = product_id
        self._device = None

    @property
    def connected(self) -> bool:
        return self._device is not None

    def probe(self) -> dict[str, Any]:
        payload = {
            "transport_id": self.transport_id,
            "module_available": hid is not None,
            "device_visible": False,
            "connectable": False,
            "note": "hidapi transport expects the device to be directly exposed to userspace HID.",
        }
        if hid is None:
            payload["error"] = "python-hid unavailable"
            return payload
        enumerate_method = getattr(hid, "enumerate", None)
        if enumerate_method is None:
            payload["note"] = "python-hid is available but enumerate() is missing; connect attempt may still work."
            payload["connectable"] = True
            return payload
        try:
            matches = enumerate_method(self.vendor_id, self.product_id) or []
        except Exception as exc:  # pragma: no cover - runtime dependent
            payload["error"] = str(exc)
            return payload
        if matches:
            payload["device_visible"] = True
            payload["connectable"] = True
            payload["device_count"] = len(matches)
            payload["paths"] = [str(match.get("path") or "") for match in matches if isinstance(match, dict)]
        return payload

    def connect(self) -> tuple[bool, dict[str, Any]]:
        info = self.probe()
        if hid is None:
            return False, info
        try:
            device = hid.device()
            device.open(self.vendor_id, self.product_id)
            try:
                device.set_nonblocking(True)
            except Exception:
                pass
            self._device = device
            info.update(
                {
                    "connected": True,
                    "connectable": True,
                    "device_visible": True,
                    "manufacturer": self._read_string(device, "get_manufacturer_string"),
                    "product": self._read_string(device, "get_product_string"),
                    "serial_number": self._read_string(device, "get_serial_number_string"),
                }
            )
            return True, info
        except Exception as exc:  # pragma: no cover - hardware runtime dependent
            self.disconnect()
            info["error"] = str(exc)
            info["connected"] = False
            return False, info

    def disconnect(self) -> None:
        device = self._device
        self._device = None
        if device is None:
            return
        with contextlib.suppress(Exception):
            device.close()

    def read_report(self, *, max_length: int = 64, timeout_ms: int = 2) -> bytes | None:
        device = self._device
        if device is None:
            return None
        try:
            try:
                raw = device.read(max_length, timeout_ms)
            except TypeError:
                raw = device.read(max_length)
        except Exception:
            self.disconnect()
            return None
        if not raw:
            return None
        return bytes(raw)

    def write_reports(self, reports: Iterable[bytes]) -> bool:
        device = self._device
        if device is None:
            return False
        try:
            for report in reports:
                payload = bytes(report)
                if payload:
                    device.write(payload)
            return True
        except Exception:
            self.disconnect()
            return False

    @staticmethod
    def _read_string(device: Any, method_name: str) -> str | None:
        method = getattr(device, method_name, None)
        if method is None:
            return None
        try:
            value = method()
        except Exception:
            return None
        return str(value) if value is not None else None


class PyUsbBulkMaschineTransport:
    transport_id = "pyusb-bulk"

    def __init__(
        self,
        *,
        vendor_id: int,
        product_id: int,
        allow_kernel_detach: bool = False,
    ) -> None:
        self.vendor_id = vendor_id
        self.product_id = product_id
        self.allow_kernel_detach = allow_kernel_detach
        self._device = None
        self._read_endpoint = None
        self._write_endpoint = None
        self._claimed_interface_number: int | None = None
        self._detached_interface = False

    @property
    def connected(self) -> bool:
        return self._device is not None and self._read_endpoint is not None and self._write_endpoint is not None

    def probe(self) -> dict[str, Any]:
        sysfs_probe = probe_sysfs_usb_device(self.vendor_id, self.product_id)
        preferred_bulk_pair = sysfs_probe.get("preferred_bulk_pair")
        device_node = sysfs_probe.get("device_node")
        preferred_interface_driver = sysfs_probe.get("preferred_interface_driver")
        host_constraints: list[str] = []
        if isinstance(preferred_interface_driver, str) and preferred_interface_driver:
            host_constraints.append(f"Preferred vendor interface is bound to {preferred_interface_driver}.")
        usb_access_blocked = bool(
            isinstance(device_node, dict)
            and device_node.get("exists")
            and not device_node.get("current_user_can_access")
        )
        if isinstance(device_node, dict):
            owner_name = str(device_node.get("owner_name") or device_node.get("owner_uid") or "unknown")
            group_name = str(device_node.get("group_name") or device_node.get("group_gid") or "unknown")
            if usb_access_blocked:
                host_constraints.append(
                    "USB device node "
                    f"{device_node.get('path')} is {owner_name}:{group_name} "
                    f"{device_node.get('mode_octal') or 'unknown'}; current uid "
                    f"{device_node.get('current_uid')} lacks direct read/write access."
                )
        payload = {
            "transport_id": self.transport_id,
            "module_available": usb_core is not None and usb_util is not None,
            "device_visible": bool(sysfs_probe.get("interfaces")),
            "connectable": False,
            "allow_kernel_detach": self.allow_kernel_detach,
            "access_blocked": usb_access_blocked,
            "sysfs_probe": sysfs_probe,
            "note": "pyusb bulk transport can target vendor endpoints when hidraw is unavailable.",
        }
        if isinstance(device_node, dict):
            payload["device_node"] = dict(device_node)
        if isinstance(preferred_bulk_pair, dict):
            payload["preferred_endpoint_pair"] = dict(preferred_bulk_pair)
            payload.update(
                {
                    "interface_number": preferred_bulk_pair.get("interface_number"),
                    "alternate_setting": preferred_bulk_pair.get("alternate_setting"),
                    "write_endpoint_address_hex": preferred_bulk_pair.get("write_endpoint_address_hex"),
                    "read_endpoint_address_hex": preferred_bulk_pair.get("read_endpoint_address_hex"),
                }
            )
        if host_constraints:
            payload["host_constraints"] = list(host_constraints)
        if usb_core is None or usb_util is None:
            if isinstance(preferred_bulk_pair, dict):
                payload["note"] = (
                    f"Host exposes preferred bulk alt {int(preferred_bulk_pair.get('alternate_setting') or 0)} "
                    f"OUT {preferred_bulk_pair.get('write_endpoint_address_hex') or 'n/a'} "
                    f"IN {preferred_bulk_pair.get('read_endpoint_address_hex') or 'n/a'}, but pyusb is not installed. "
                    f"{' '.join(host_constraints)} "
                    "Keep the runtime on ALSA MIDI / descriptor-only fallback until pyusb plus a safe udev or privileged detach flow is available."
                )
            payload["error"] = "pyusb unavailable"
            return payload
        device = self._find_device()
        if device is None:
            return payload
        payload["device_visible"] = True
        endpoint_info = self._resolve_bulk_endpoints(device)
        if endpoint_info is None:
            payload["error"] = "no suitable bulk interface found"
            return payload
        payload.update(self._sanitize_runtime_info(endpoint_info))
        kernel_active = bool(endpoint_info.get("kernel_driver_active"))
        payload["connectable"] = (not kernel_active or self.allow_kernel_detach) and not usb_access_blocked
        payload["note"] = (
            f"Preferred bulk alt {int(endpoint_info.get('alternate_setting') or 0)} "
            f"OUT {endpoint_info.get('write_endpoint_address_hex') or 'n/a'} "
            f"IN {endpoint_info.get('read_endpoint_address_hex') or 'n/a'}."
        )
        if kernel_active and not self.allow_kernel_detach:
            payload["note"] = (
                f"Vendor bulk interface is kernel-bound by {preferred_interface_driver or 'the active kernel driver'}; "
                "enable kernel detach explicitly to claim it."
            )
        if usb_access_blocked:
            payload["note"] = f"{payload['note']} {' '.join(host_constraints)}"
        return payload

    def connect(self) -> tuple[bool, dict[str, Any]]:
        info = self.probe()
        if usb_core is None or usb_util is None:
            return False, info
        if bool(info.get("access_blocked")):
            info["error"] = "device node access denied"
            return False, info
        device = self._find_device()
        if device is None:
            info["error"] = "device not visible to pyusb"
            return False, info
        endpoint_info = self._resolve_bulk_endpoints(device)
        if endpoint_info is None:
            info["error"] = "no suitable bulk interface found"
            return False, info
        interface_number = int(endpoint_info["interface_number"])
        alternate_setting = int(endpoint_info.get("alternate_setting") or 0)
        kernel_active = bool(endpoint_info.get("kernel_driver_active"))
        if kernel_active and not self.allow_kernel_detach:
            info.update(endpoint_info)
            info["error"] = "interface requires kernel detach"
            return False, info
        try:
            if kernel_active:
                device.detach_kernel_driver(interface_number)
                self._detached_interface = True
            usb_util.claim_interface(device, interface_number)
            if alternate_setting:
                with contextlib.suppress(Exception):
                    device.set_interface_altsetting(interface=interface_number, alternate_setting=alternate_setting)
            self._device = device
            self._claimed_interface_number = interface_number
            self._read_endpoint = endpoint_info["read_endpoint"]
            self._write_endpoint = endpoint_info["write_endpoint"]
            info.update(endpoint_info)
            info["connected"] = True
            info["connectable"] = True
            return True, self._sanitize_runtime_info(info)
        except Exception as exc:  # pragma: no cover - runtime dependent
            self.disconnect()
            info.update(endpoint_info)
            info["error"] = str(exc)
            info["connected"] = False
            return False, self._sanitize_runtime_info(info)

    def disconnect(self) -> None:
        if usb_util is not None and self._device is not None and self._claimed_interface_number is not None:
            with contextlib.suppress(Exception):
                usb_util.release_interface(self._device, self._claimed_interface_number)
            if self._detached_interface:
                with contextlib.suppress(Exception):
                    self._device.attach_kernel_driver(self._claimed_interface_number)
        self._device = None
        self._read_endpoint = None
        self._write_endpoint = None
        self._claimed_interface_number = None
        self._detached_interface = False

    def read_report(self, *, max_length: int = 64, timeout_ms: int = 2) -> bytes | None:
        endpoint = self._read_endpoint
        if endpoint is None:
            return None
        try:
            payload = endpoint.read(max_length, timeout=timeout_ms)
        except Exception:
            return None
        if payload is None:
            return None
        return bytes(payload)

    def write_reports(self, reports: Iterable[bytes]) -> bool:
        endpoint = self._write_endpoint
        if endpoint is None:
            return False
        try:
            for report in reports:
                payload = bytes(report)
                if payload:
                    endpoint.write(payload)
            return True
        except Exception:
            self.disconnect()
            return False

    def _find_device(self):
        if usb_core is None:
            return None
        try:
            return usb_core.find(idVendor=self.vendor_id, idProduct=self.product_id)
        except Exception:  # pragma: no cover - runtime dependent
            return None

    def _resolve_bulk_endpoints(self, device: Any) -> dict[str, Any] | None:
        if usb_util is None:
            return None
        try:
            configuration = device.get_active_configuration()
        except Exception:
            return None
        preferred_candidate: dict[str, Any] | None = None
        for interface in configuration:
            endpoints = list(interface.endpoints())
            bulk_in = sorted(
                (
                    endpoint for endpoint in endpoints
                    if usb_util.endpoint_type(endpoint.bmAttributes) == usb_util.ENDPOINT_TYPE_BULK
                    and usb_util.endpoint_direction(endpoint.bEndpointAddress) == usb_util.ENDPOINT_IN
                ),
                key=lambda endpoint: int(endpoint.bEndpointAddress),
            )
            bulk_out = sorted(
                (
                    endpoint for endpoint in endpoints
                    if usb_util.endpoint_type(endpoint.bmAttributes) == usb_util.ENDPOINT_TYPE_BULK
                    and usb_util.endpoint_direction(endpoint.bEndpointAddress) == usb_util.ENDPOINT_OUT
                ),
                key=lambda endpoint: int(endpoint.bEndpointAddress),
            )
            if not bulk_in or not bulk_out:
                continue
            kernel_active = False
            with contextlib.suppress(Exception):
                kernel_active = bool(device.is_kernel_driver_active(interface.bInterfaceNumber))
            candidate = {
                "interface_number": int(interface.bInterfaceNumber),
                "alternate_setting": int(getattr(interface, "bAlternateSetting", 0)),
                "interface_class": int(interface.bInterfaceClass),
                "interface_subclass": int(interface.bInterfaceSubClass),
                "interface_protocol": int(interface.bInterfaceProtocol),
                "kernel_driver_active": kernel_active,
                "read_endpoint_address": int(bulk_in[-1].bEndpointAddress),
                "read_endpoint_address_hex": _format_endpoint_address(int(bulk_in[-1].bEndpointAddress)),
                "write_endpoint_address": int(bulk_out[-1].bEndpointAddress),
                "write_endpoint_address_hex": _format_endpoint_address(int(bulk_out[-1].bEndpointAddress)),
                "read_endpoint_candidates": [_format_endpoint_address(int(endpoint.bEndpointAddress)) for endpoint in bulk_in],
                "write_endpoint_candidates": [_format_endpoint_address(int(endpoint.bEndpointAddress)) for endpoint in bulk_out],
                "read_endpoint": bulk_in[-1],
                "write_endpoint": bulk_out[-1],
                "endpoint_addresses": [
                    _format_endpoint_address(int(endpoint.bEndpointAddress))
                    for endpoint in sorted(endpoints, key=lambda endpoint: int(endpoint.bEndpointAddress))
                ],
            }
            if preferred_candidate is None or _candidate_selection_score(candidate) > _candidate_selection_score(preferred_candidate):
                preferred_candidate = candidate
        return preferred_candidate

    @staticmethod
    def _sanitize_runtime_info(info: dict[str, Any]) -> dict[str, Any]:
        payload = dict(info)
        payload.pop("read_endpoint", None)
        payload.pop("write_endpoint", None)
        return payload


class MaschineTransportController:
    def __init__(
        self,
        *,
        vendor_id: int,
        product_id: int,
        preference: str = "auto",
        allow_kernel_detach: bool = False,
    ) -> None:
        normalized_preference = str(preference or "auto").strip().lower()
        if normalized_preference in {"pyusb", "usb", "bulk"}:
            normalized_preference = "pyusb-bulk"
        if normalized_preference not in {"auto", "hidapi", "pyusb-bulk"}:
            normalized_preference = "auto"
        self.preference = normalized_preference
        self.allow_kernel_detach = bool(allow_kernel_detach)
        self._hidapi = HidApiMaschineTransport(vendor_id=vendor_id, product_id=product_id)
        self._pyusb = PyUsbBulkMaschineTransport(
            vendor_id=vendor_id,
            product_id=product_id,
            allow_kernel_detach=self.allow_kernel_detach,
        )
        self._active_transport: HidApiMaschineTransport | PyUsbBulkMaschineTransport | None = None
        self._active_info: dict[str, Any] = {}

    @property
    def connected(self) -> bool:
        return self._active_transport is not None and bool(self._active_transport.connected)

    def current_transport_id(self) -> str | None:
        if self._active_transport is None:
            return None
        return str(self._active_info.get("transport_id") or getattr(self._active_transport, "transport_id", "unknown"))

    def probe_candidates(self) -> list[dict[str, Any]]:
        return [self._hidapi.probe(), self._pyusb.probe()]

    def connect(self) -> tuple[bool, dict[str, Any]]:
        last_info: dict[str, Any] = {
            "transport_id": "none",
            "preference": self.preference,
            "allow_kernel_detach": self.allow_kernel_detach,
            "connected": False,
        }
        for adapter in self._ordered_adapters():
            connected, info = adapter.connect()
            if connected:
                self._active_transport = adapter
                self._active_info = {
                    **info,
                    "transport_id": getattr(adapter, "transport_id", "unknown"),
                    "preference": self.preference,
                    "allow_kernel_detach": self.allow_kernel_detach,
                    "connected": True,
                }
                return True, self.runtime_info()
            last_info = {
                **info,
                "transport_id": getattr(adapter, "transport_id", "unknown"),
                "preference": self.preference,
                "allow_kernel_detach": self.allow_kernel_detach,
                "connected": False,
            }
        self._active_transport = None
        self._active_info = last_info
        return False, self.runtime_info()

    def disconnect(self) -> None:
        if self._active_transport is not None:
            self._active_transport.disconnect()
        self._active_transport = None

    def read_report(self, *, max_length: int = 64, timeout_ms: int = 2) -> bytes | None:
        if self._active_transport is None:
            return None
        return self._active_transport.read_report(max_length=max_length, timeout_ms=timeout_ms)

    def write_reports(self, reports: Iterable[bytes]) -> bool:
        if self._active_transport is None:
            return False
        return self._active_transport.write_reports(reports)

    def runtime_info(self) -> dict[str, Any]:
        return {
            "transport_id": self.current_transport_id() or "none",
            "preference": self.preference,
            "allow_kernel_detach": self.allow_kernel_detach,
            "connected": self.connected,
            "selected_transport": dict(self._active_info),
            "candidates": self.probe_candidates(),
        }

    def _ordered_adapters(self) -> list[HidApiMaschineTransport | PyUsbBulkMaschineTransport]:
        if self.preference == "hidapi":
            return [self._hidapi, self._pyusb]
        if self.preference == "pyusb-bulk":
            return [self._pyusb, self._hidapi]
        return [self._hidapi, self._pyusb]
