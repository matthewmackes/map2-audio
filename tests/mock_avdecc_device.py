"""
AVDECC mock device harness for CI/hardware-light integration tests.

The mock supports packet-level request/response flows for:
- ADP discovery advertisement
- AECP READ_DESCRIPTOR / GET_STREAM_FORMAT / SET_STREAM_FORMAT
- ACMP CONNECT / DISCONNECT / LIST_CONNECTIONS

Default transport is in-memory and CI-safe. A raw-socket responder is included
for optional local verification when CAP_NET_RAW is available.
"""

from __future__ import annotations

import socket
import struct
import threading
from dataclasses import dataclass
from enum import IntEnum
from typing import Any, Dict, List, Optional, Tuple


class AvdeccMessageType(IntEnum):
    ADP_DISCOVER = 0x01
    ADP_ADVERTISEMENT = 0x02
    AECP_READ_DESCRIPTOR = 0x10
    AECP_GET_STREAM_FORMAT = 0x11
    AECP_SET_STREAM_FORMAT = 0x12
    ACMP_CONNECT = 0x20
    ACMP_DISCONNECT = 0x21
    ACMP_LIST_CONNECTIONS = 0x22
    ERROR = 0x7F


@dataclass(frozen=True)
class MockAvdeccProfile:
    name: str
    stream_count: int
    entity_name: str


PROFILES: Dict[str, MockAvdeccProfile] = {
    "8x8": MockAvdeccProfile(name="8x8", stream_count=8, entity_name="MAP2 Mock AVDECC 8x8"),
    "16x16": MockAvdeccProfile(name="16x16", stream_count=16, entity_name="MAP2 Mock AVDECC 16x16"),
}


class PacketCodec:
    """
    IEEE 1722.1-inspired binary PDU framing for mock AVDECC traffic.

    Frame header:
    - subtype (0x7A for 1722.1 AVTP control)
    - version (0)
    - message type
    - status
    - payload length (uint16)
    """

    SUBTYPE = 0x7A
    VERSION = 0
    HEADER = struct.Struct("!BBBBH")
    _DIRECTION_TO_CODE = {"talker": 1, "listener": 2}
    _DIRECTION_FROM_CODE = {1: "talker", 2: "listener"}
    _DESC_TYPE_TO_CODE = {
        "entity": 0x0000,
        "configuration": 0x0002,
        "stream_input": 0x0007,
        "stream_output": 0x0008,
    }
    _DESC_CODE_TO_TYPE = {value: key for key, value in _DESC_TYPE_TO_CODE.items()}

    @staticmethod
    def _pack_string(value: str) -> bytes:
        raw = str(value).encode("utf-8")
        if len(raw) > 0xFFFF:
            raise ValueError("string too long for mock PDU encoding")
        return struct.pack("!H", len(raw)) + raw

    @staticmethod
    def _unpack_string(payload: bytes, offset: int) -> Tuple[str, int]:
        if offset + 2 > len(payload):
            raise ValueError("incomplete string length")
        length = int.from_bytes(payload[offset : offset + 2], byteorder="big", signed=False)
        offset += 2
        end = offset + length
        if end > len(payload):
            raise ValueError("incomplete string payload")
        return payload[offset:end].decode("utf-8"), end

    @classmethod
    def _normalize_descriptor_type(cls, raw: Any) -> str:
        if isinstance(raw, int):
            if raw in cls._DESC_CODE_TO_TYPE:
                return cls._DESC_CODE_TO_TYPE[raw]
            raise ValueError(f"unsupported descriptor_type={raw}")
        normalized = str(raw or "").strip().lower()
        if normalized in cls._DESC_TYPE_TO_CODE:
            return normalized
        if normalized.isdigit():
            code = int(normalized)
            if code in cls._DESC_CODE_TO_TYPE:
                return cls._DESC_CODE_TO_TYPE[code]
        raise ValueError(f"unsupported descriptor_type={raw}")

    @classmethod
    def _descriptor_type_code(cls, raw: Any) -> int:
        return cls._DESC_TYPE_TO_CODE[cls._normalize_descriptor_type(raw)]

    @classmethod
    def _descriptor_type_name(cls, code: int) -> str:
        if code not in cls._DESC_CODE_TO_TYPE:
            raise ValueError(f"unsupported descriptor_type code={code}")
        return cls._DESC_CODE_TO_TYPE[code]

    @classmethod
    def _direction_code(cls, raw: Any) -> int:
        normalized = str(raw or "").strip().lower()
        if normalized in {"talker", "stream_output", "output"}:
            return cls._DIRECTION_TO_CODE["talker"]
        if normalized in {"listener", "stream_input", "input"}:
            return cls._DIRECTION_TO_CODE["listener"]
        raise ValueError("direction must be talker or listener")

    @classmethod
    def _direction_name(cls, code: int) -> str:
        if code not in cls._DIRECTION_FROM_CODE:
            raise ValueError(f"unsupported direction code={code}")
        return cls._DIRECTION_FROM_CODE[code]

    @staticmethod
    def _parse_entity_id(raw: Any) -> int:
        if isinstance(raw, int):
            return int(raw)
        text = str(raw or "").strip().lower().removeprefix("0x")
        if not text:
            return 0
        return int(text, 16)

    @classmethod
    def _encode_body(cls, message_type: AvdeccMessageType, payload: Dict[str, Any]) -> bytes:
        if message_type == AvdeccMessageType.ADP_DISCOVER:
            return b""

        if message_type == AvdeccMessageType.ADP_ADVERTISEMENT:
            entity_id = cls._parse_entity_id(payload.get("entity_id"))
            entity_model_id = cls._parse_entity_id(payload.get("entity_model_id"))
            stream_count = int(payload.get("stream_count", 0)) & 0xFFFF
            profiles = list(payload.get("profiles", []))
            body = struct.pack("!QQH", entity_id, entity_model_id, stream_count)
            body += cls._pack_string(payload.get("firmware_version", ""))
            body += cls._pack_string(payload.get("entity_name", ""))
            body += struct.pack("!B", len(profiles) & 0xFF)
            for profile_name in profiles:
                body += cls._pack_string(profile_name)
            return body

        if message_type == AvdeccMessageType.AECP_READ_DESCRIPTOR:
            descriptor = payload.get("descriptor")
            if descriptor is None:
                descriptor_type_code = cls._descriptor_type_code(payload.get("descriptor_type", "entity"))
                descriptor_index = int(payload.get("descriptor_index", 0)) & 0xFFFF
                return struct.pack("!HH", descriptor_type_code, descriptor_index)

            descriptor_type = cls._normalize_descriptor_type(descriptor.get("descriptor_type"))
            descriptor_type_code = cls._descriptor_type_code(descriptor_type)
            descriptor_index = int(descriptor.get("descriptor_index", 0)) & 0xFFFF
            body = struct.pack(
                "!BHH",
                1 if payload.get("success", True) else 0,
                descriptor_type_code,
                descriptor_index,
            )

            if descriptor_type == "entity":
                body += struct.pack(
                    "!QQHH",
                    cls._parse_entity_id(descriptor.get("entity_id")),
                    cls._parse_entity_id(descriptor.get("entity_model_id")),
                    int(descriptor.get("talker_stream_sources", 0)) & 0xFFFF,
                    int(descriptor.get("listener_stream_sinks", 0)) & 0xFFFF,
                )
                body += cls._pack_string(descriptor.get("firmware_version", ""))
                body += cls._pack_string(descriptor.get("entity_name", ""))
                return body

            if descriptor_type == "configuration":
                body += cls._pack_string(descriptor.get("configuration_name", ""))
                return body

            if descriptor_type in {"stream_input", "stream_output"}:
                body += struct.pack("!Q", int(descriptor.get("stream_format", 0)))
                return body

            raise ValueError(f"unsupported descriptor_type={descriptor_type}")

        if message_type in {
            AvdeccMessageType.AECP_GET_STREAM_FORMAT,
            AvdeccMessageType.AECP_SET_STREAM_FORMAT,
        }:
            direction_code = cls._direction_code(payload.get("direction"))
            stream_index = int(payload.get("stream_index", 0)) & 0xFFFF
            if "success" in payload:
                body = struct.pack(
                    "!BBH",
                    1 if payload.get("success", False) else 0,
                    direction_code,
                    stream_index,
                )
                body += struct.pack("!Q", int(payload.get("stream_format", 0)))
                return body

            body = struct.pack("!BH", direction_code, stream_index)
            if message_type == AvdeccMessageType.AECP_SET_STREAM_FORMAT:
                body += struct.pack("!Q", int(payload.get("stream_format", 0)))
            return body

        if message_type == AvdeccMessageType.ACMP_CONNECT:
            connection = payload.get("connection")
            if connection is None:
                return struct.pack(
                    "!QHQH",
                    cls._parse_entity_id(payload.get("talker_entity_id")),
                    int(payload.get("talker_stream_index", 0)) & 0xFFFF,
                    cls._parse_entity_id(payload.get("listener_entity_id")),
                    int(payload.get("listener_stream_index", 0)) & 0xFFFF,
                )
            return struct.pack(
                "!BQHQH",
                1 if payload.get("success", False) else 0,
                cls._parse_entity_id(connection.get("talker_entity_id")),
                int(connection.get("talker_stream_index", 0)) & 0xFFFF,
                cls._parse_entity_id(connection.get("listener_entity_id")),
                int(connection.get("listener_stream_index", 0)) & 0xFFFF,
            )

        if message_type == AvdeccMessageType.ACMP_DISCONNECT:
            if "removed" in payload:
                return struct.pack(
                    "!BB",
                    1 if payload.get("success", False) else 0,
                    1 if payload.get("removed", False) else 0,
                )
            return struct.pack(
                "!HH",
                int(payload.get("talker_stream_index", 0)) & 0xFFFF,
                int(payload.get("listener_stream_index", 0)) & 0xFFFF,
            )

        if message_type == AvdeccMessageType.ACMP_LIST_CONNECTIONS:
            if "connections" not in payload:
                return b""
            connections = list(payload.get("connections", []))
            body = struct.pack(
                "!BH",
                1 if payload.get("success", False) else 0,
                len(connections) & 0xFFFF,
            )
            for connection in connections:
                body += struct.pack(
                    "!QHQH",
                    cls._parse_entity_id(connection.get("talker_entity_id")),
                    int(connection.get("talker_stream_index", 0)) & 0xFFFF,
                    cls._parse_entity_id(connection.get("listener_entity_id")),
                    int(connection.get("listener_stream_index", 0)) & 0xFFFF,
                )
            return body

        if message_type == AvdeccMessageType.ERROR:
            status = payload.get("status", "error")
            reason = payload.get("reason", "")
            return struct.pack("!B", 1 if payload.get("success", False) else 0) + cls._pack_string(status) + cls._pack_string(reason)

        raise ValueError(f"unsupported message_type={int(message_type)}")

    @classmethod
    def _decode_body(cls, message_type: AvdeccMessageType, payload: bytes) -> Dict[str, Any]:
        if message_type == AvdeccMessageType.ADP_DISCOVER:
            return {}

        if message_type == AvdeccMessageType.ADP_ADVERTISEMENT:
            if len(payload) < struct.calcsize("!QQH"):
                raise ValueError("ADP_ADVERTISEMENT payload too short")
            entity_id, entity_model_id, stream_count = struct.unpack("!QQH", payload[:18])
            offset = 18
            firmware_version, offset = cls._unpack_string(payload, offset)
            entity_name, offset = cls._unpack_string(payload, offset)
            if offset + 1 > len(payload):
                raise ValueError("ADP_ADVERTISEMENT profile count missing")
            profile_count = payload[offset]
            offset += 1
            profiles: List[str] = []
            for _ in range(profile_count):
                profile_name, offset = cls._unpack_string(payload, offset)
                profiles.append(profile_name)
            return {
                "success": True,
                "entity_id": f"{entity_id:016x}",
                "entity_model_id": f"{entity_model_id:016x}",
                "firmware_version": firmware_version,
                "entity_name": entity_name,
                "stream_count": int(stream_count),
                "profiles": profiles,
            }

        if message_type == AvdeccMessageType.AECP_READ_DESCRIPTOR:
            # Request payload.
            if len(payload) == 4:
                descriptor_type_code, descriptor_index = struct.unpack("!HH", payload)
                return {
                    "descriptor_type": cls._descriptor_type_name(descriptor_type_code),
                    "descriptor_index": int(descriptor_index),
                }

            # Response payload.
            if len(payload) < 5:
                raise ValueError("AECP_READ_DESCRIPTOR payload too short")
            success, descriptor_type_code, descriptor_index = struct.unpack("!BHH", payload[:5])
            descriptor_type = cls._descriptor_type_name(descriptor_type_code)
            offset = 5
            descriptor: Dict[str, Any] = {
                "descriptor_type": descriptor_type,
                "descriptor_index": int(descriptor_index),
            }
            if descriptor_type == "entity":
                if offset + struct.calcsize("!QQHH") > len(payload):
                    raise ValueError("AECP entity descriptor payload too short")
                entity_id, entity_model_id, talker_sources, listener_sinks = struct.unpack(
                    "!QQHH", payload[offset : offset + 20]
                )
                offset += 20
                firmware_version, offset = cls._unpack_string(payload, offset)
                entity_name, offset = cls._unpack_string(payload, offset)
                descriptor.update(
                    {
                        "entity_id": f"{entity_id:016x}",
                        "entity_model_id": f"{entity_model_id:016x}",
                        "firmware_version": firmware_version,
                        "entity_name": entity_name,
                        "talker_stream_sources": int(talker_sources),
                        "listener_stream_sinks": int(listener_sinks),
                    }
                )
            elif descriptor_type == "configuration":
                configuration_name, offset = cls._unpack_string(payload, offset)
                descriptor["configuration_name"] = configuration_name
            elif descriptor_type in {"stream_input", "stream_output"}:
                if offset + 8 > len(payload):
                    raise ValueError("AECP stream descriptor payload too short")
                (stream_format,) = struct.unpack("!Q", payload[offset : offset + 8])
                descriptor["stream_format"] = int(stream_format)
            else:
                raise ValueError(f"unsupported descriptor_type={descriptor_type}")
            return {"success": bool(success), "descriptor": descriptor}

        if message_type in {
            AvdeccMessageType.AECP_GET_STREAM_FORMAT,
            AvdeccMessageType.AECP_SET_STREAM_FORMAT,
        }:
            # Request payload for GET.
            if len(payload) == 3:
                direction_code, stream_index = struct.unpack("!BH", payload)
                return {
                    "direction": cls._direction_name(direction_code),
                    "stream_index": int(stream_index),
                }
            # Request payload for SET.
            if len(payload) == 11:
                direction_code, stream_index = struct.unpack("!BH", payload[:3])
                (stream_format,) = struct.unpack("!Q", payload[3:11])
                return {
                    "direction": cls._direction_name(direction_code),
                    "stream_index": int(stream_index),
                    "stream_format": int(stream_format),
                }
            # Response payload.
            if len(payload) != 12:
                raise ValueError("AECP stream format response payload has invalid length")
            success, direction_code, stream_index = struct.unpack("!BBH", payload[:4])
            (stream_format,) = struct.unpack("!Q", payload[4:12])
            return {
                "success": bool(success),
                "direction": cls._direction_name(direction_code),
                "stream_index": int(stream_index),
                "stream_format": int(stream_format),
            }

        if message_type == AvdeccMessageType.ACMP_CONNECT:
            # Request payload.
            if len(payload) == 20:
                talker_entity_id, talker_stream_index, listener_entity_id, listener_stream_index = struct.unpack(
                    "!QHQH", payload
                )
                return {
                    "talker_entity_id": f"{talker_entity_id:016x}",
                    "talker_stream_index": int(talker_stream_index),
                    "listener_entity_id": f"{listener_entity_id:016x}",
                    "listener_stream_index": int(listener_stream_index),
                }
            # Response payload.
            if len(payload) == 21:
                success = bool(payload[0])
                talker_entity_id, talker_stream_index, listener_entity_id, listener_stream_index = struct.unpack(
                    "!QHQH", payload[1:]
                )
                return {
                    "success": success,
                    "connection": {
                        "talker_entity_id": f"{talker_entity_id:016x}",
                        "talker_stream_index": int(talker_stream_index),
                        "listener_entity_id": f"{listener_entity_id:016x}",
                        "listener_stream_index": int(listener_stream_index),
                    },
                }
            raise ValueError("ACMP_CONNECT payload has invalid length")

        if message_type == AvdeccMessageType.ACMP_DISCONNECT:
            # Request payload.
            if len(payload) == 4:
                talker_stream_index, listener_stream_index = struct.unpack("!HH", payload)
                return {
                    "talker_stream_index": int(talker_stream_index),
                    "listener_stream_index": int(listener_stream_index),
                }
            # Response payload.
            if len(payload) == 2:
                success, removed = struct.unpack("!BB", payload)
                return {"success": bool(success), "removed": bool(removed)}
            raise ValueError("ACMP_DISCONNECT payload has invalid length")

        if message_type == AvdeccMessageType.ACMP_LIST_CONNECTIONS:
            # Request payload.
            if len(payload) == 0:
                return {}
            if len(payload) < 3:
                raise ValueError("ACMP_LIST_CONNECTIONS payload too short")
            success, count = struct.unpack("!BH", payload[:3])
            offset = 3
            connections: List[Dict[str, Any]] = []
            for _ in range(int(count)):
                if offset + 20 > len(payload):
                    raise ValueError("ACMP_LIST_CONNECTIONS payload truncated")
                talker_entity_id, talker_stream_index, listener_entity_id, listener_stream_index = struct.unpack(
                    "!QHQH", payload[offset : offset + 20]
                )
                offset += 20
                connections.append(
                    {
                        "talker_entity_id": f"{talker_entity_id:016x}",
                        "talker_stream_index": int(talker_stream_index),
                        "listener_entity_id": f"{listener_entity_id:016x}",
                        "listener_stream_index": int(listener_stream_index),
                    }
                )
            return {"success": bool(success), "connections": connections}

        if message_type == AvdeccMessageType.ERROR:
            if len(payload) < 1:
                raise ValueError("ERROR payload too short")
            success = bool(payload[0])
            offset = 1
            status, offset = cls._unpack_string(payload, offset)
            reason, offset = cls._unpack_string(payload, offset)
            return {"success": success, "status": status, "reason": reason}

        raise ValueError(f"unsupported message_type={int(message_type)}")

    @classmethod
    def encode(cls, message_type: AvdeccMessageType, payload: Dict[str, Any]) -> bytes:
        body = cls._encode_body(message_type, payload or {})
        header = cls.HEADER.pack(
            cls.SUBTYPE,
            cls.VERSION,
            int(message_type),
            0,
            len(body),
        )
        return header + body

    @classmethod
    def decode(cls, packet: bytes) -> Tuple[AvdeccMessageType, Dict[str, Any]]:
        if len(packet) < cls.HEADER.size:
            raise ValueError("packet too short")
        subtype, version, message_type_raw, _status, payload_len = cls.HEADER.unpack(
            packet[: cls.HEADER.size]
        )
        if subtype != cls.SUBTYPE:
            raise ValueError("invalid AVDECC mock subtype")
        if version != cls.VERSION:
            raise ValueError(f"unsupported packet version: {version}")
        payload = packet[cls.HEADER.size : cls.HEADER.size + payload_len]
        if len(payload) != payload_len:
            raise ValueError("incomplete packet payload")
        message_type = AvdeccMessageType(message_type_raw)
        return message_type, cls._decode_body(message_type, payload)


class MockAvdeccDevice:
    DEFAULT_STREAM_FORMAT = 0x0200000218000005  # 2ch, 24-bit, 48kHz (MAP2 route encoding)

    def __init__(
        self,
        *,
        entity_id: int = 0x0011223344556677,
        entity_model_id: int = 0x00AA00BB00CC00DD,
        firmware_version: str = "1.2.3-mock",
        profile: str = "8x8",
    ):
        if profile not in PROFILES:
            raise ValueError(f"Unknown profile '{profile}'. Available: {sorted(PROFILES)}")

        profile_cfg = PROFILES[profile]
        self.profile = profile_cfg
        self.entity_id = int(entity_id)
        self.entity_model_id = int(entity_model_id)
        self.firmware_version = str(firmware_version)
        self._talker_formats = {
            idx: self.DEFAULT_STREAM_FORMAT for idx in range(profile_cfg.stream_count)
        }
        self._listener_formats = {
            idx: self.DEFAULT_STREAM_FORMAT for idx in range(profile_cfg.stream_count)
        }
        self._connections: List[Dict[str, Any]] = []
        self._lock = threading.RLock()

    def _descriptor_payload(self, descriptor_type: Any, descriptor_index: int) -> Dict[str, Any]:
        normalized_type = str(descriptor_type).strip().lower()
        if normalized_type in {"0", "entity"}:
            if descriptor_index != 0:
                raise ValueError("entity descriptor index out of range")
            return {
                "descriptor_type": "entity",
                "descriptor_index": 0,
                "entity_id": f"{self.entity_id:016x}",
                "entity_model_id": f"{self.entity_model_id:016x}",
                "firmware_version": self.firmware_version,
                "entity_name": self.profile.entity_name,
                "talker_stream_sources": self.profile.stream_count,
                "listener_stream_sinks": self.profile.stream_count,
            }

        if normalized_type in {"2", "configuration"}:
            if descriptor_index != 0:
                raise ValueError("configuration descriptor index out of range")
            return {
                "descriptor_type": "configuration",
                "descriptor_index": 0,
                "configuration_name": f"{self.profile.name}-default",
            }

        if normalized_type in {"7", "stream_input"}:
            if descriptor_index not in self._listener_formats:
                raise ValueError("stream_input descriptor index out of range")
            return {
                "descriptor_type": "stream_input",
                "descriptor_index": descriptor_index,
                "stream_format": int(self._listener_formats[descriptor_index]),
            }

        if normalized_type in {"8", "stream_output"}:
            if descriptor_index not in self._talker_formats:
                raise ValueError("stream_output descriptor index out of range")
            return {
                "descriptor_type": "stream_output",
                "descriptor_index": descriptor_index,
                "stream_format": int(self._talker_formats[descriptor_index]),
            }

        raise ValueError(f"unsupported descriptor_type={descriptor_type}")

    @staticmethod
    def _normalize_direction(raw_direction: Any) -> str:
        direction = str(raw_direction or "").strip().lower()
        if direction in {"talker", "stream_output", "output"}:
            return "talker"
        if direction in {"listener", "stream_input", "input"}:
            return "listener"
        raise ValueError("direction must be talker or listener")

    def _ensure_stream_exists(self, direction: str, stream_index: int) -> None:
        stream_map = self._talker_formats if direction == "talker" else self._listener_formats
        if stream_index not in stream_map:
            raise ValueError(f"{direction} stream_index out of range: {stream_index}")

    def _get_stream_format(self, direction: str, stream_index: int) -> int:
        stream_map = self._talker_formats if direction == "talker" else self._listener_formats
        return int(stream_map[stream_index])

    def _set_stream_format(self, direction: str, stream_index: int, stream_format: int) -> int:
        stream_map = self._talker_formats if direction == "talker" else self._listener_formats
        stream_map[stream_index] = int(stream_format)
        return int(stream_map[stream_index])

    def handle_packet(self, packet: bytes) -> bytes:
        with self._lock:
            try:
                message_type, payload = PacketCodec.decode(packet)
            except Exception as exc:
                return PacketCodec.encode(
                    AvdeccMessageType.ERROR,
                    {"success": False, "status": "bad_packet", "reason": str(exc)},
                )

            try:
                if message_type == AvdeccMessageType.ADP_DISCOVER:
                    return PacketCodec.encode(
                        AvdeccMessageType.ADP_ADVERTISEMENT,
                        {
                            "success": True,
                            "entity_id": f"{self.entity_id:016x}",
                            "entity_model_id": f"{self.entity_model_id:016x}",
                            "firmware_version": self.firmware_version,
                            "entity_name": self.profile.entity_name,
                            "stream_count": self.profile.stream_count,
                            "profiles": sorted(PROFILES.keys()),
                        },
                    )

                if message_type == AvdeccMessageType.AECP_READ_DESCRIPTOR:
                    descriptor_type = payload.get("descriptor_type", "entity")
                    descriptor_index = int(payload.get("descriptor_index", 0))
                    descriptor = self._descriptor_payload(descriptor_type, descriptor_index)
                    return PacketCodec.encode(
                        AvdeccMessageType.AECP_READ_DESCRIPTOR,
                        {"success": True, "descriptor": descriptor},
                    )

                if message_type == AvdeccMessageType.AECP_GET_STREAM_FORMAT:
                    direction = self._normalize_direction(payload.get("direction"))
                    stream_index = int(payload.get("stream_index", 0))
                    self._ensure_stream_exists(direction, stream_index)
                    stream_format = self._get_stream_format(direction, stream_index)
                    return PacketCodec.encode(
                        AvdeccMessageType.AECP_GET_STREAM_FORMAT,
                        {
                            "success": True,
                            "direction": direction,
                            "stream_index": stream_index,
                            "stream_format": stream_format,
                        },
                    )

                if message_type == AvdeccMessageType.AECP_SET_STREAM_FORMAT:
                    direction = self._normalize_direction(payload.get("direction"))
                    stream_index = int(payload.get("stream_index", 0))
                    stream_format = int(payload.get("stream_format", 0))
                    self._ensure_stream_exists(direction, stream_index)
                    applied = self._set_stream_format(direction, stream_index, stream_format)
                    return PacketCodec.encode(
                        AvdeccMessageType.AECP_SET_STREAM_FORMAT,
                        {
                            "success": True,
                            "direction": direction,
                            "stream_index": stream_index,
                            "stream_format": applied,
                        },
                    )

                if message_type == AvdeccMessageType.ACMP_CONNECT:
                    talker_entity_id = str(payload.get("talker_entity_id", "")).strip().lower()
                    listener_entity_id = str(payload.get("listener_entity_id", "")).strip().lower()
                    local_entity_id = f"{self.entity_id:016x}"
                    if talker_entity_id != local_entity_id or listener_entity_id != local_entity_id:
                        raise ValueError("unknown talker/listener entity_id for this mock device")

                    talker_stream_index = int(payload.get("talker_stream_index", 0))
                    listener_stream_index = int(payload.get("listener_stream_index", 0))
                    self._ensure_stream_exists("talker", talker_stream_index)
                    self._ensure_stream_exists("listener", listener_stream_index)

                    connection = {
                        "talker_entity_id": local_entity_id,
                        "talker_stream_index": talker_stream_index,
                        "listener_entity_id": local_entity_id,
                        "listener_stream_index": listener_stream_index,
                    }
                    if connection not in self._connections:
                        self._connections.append(connection)

                    return PacketCodec.encode(
                        AvdeccMessageType.ACMP_CONNECT,
                        {"success": True, "connection": connection},
                    )

                if message_type == AvdeccMessageType.ACMP_DISCONNECT:
                    talker_stream_index = int(payload.get("talker_stream_index", 0))
                    listener_stream_index = int(payload.get("listener_stream_index", 0))
                    removed = False
                    for idx, conn in enumerate(list(self._connections)):
                        if (
                            conn.get("talker_stream_index") == talker_stream_index
                            and conn.get("listener_stream_index") == listener_stream_index
                        ):
                            del self._connections[idx]
                            removed = True
                            break
                    return PacketCodec.encode(
                        AvdeccMessageType.ACMP_DISCONNECT,
                        {"success": removed, "removed": removed},
                    )

                if message_type == AvdeccMessageType.ACMP_LIST_CONNECTIONS:
                    return PacketCodec.encode(
                        AvdeccMessageType.ACMP_LIST_CONNECTIONS,
                        {"success": True, "connections": list(self._connections)},
                    )

                raise ValueError(f"unsupported message_type={int(message_type)}")
            except Exception as exc:
                return PacketCodec.encode(
                    AvdeccMessageType.ERROR,
                    {"success": False, "status": "error", "reason": str(exc)},
                )


class InMemoryAvdeccTransport:
    """CI-safe transport that directly dispatches framed packets to the mock device."""

    def __init__(self, device: MockAvdeccDevice):
        self.device = device

    def exchange(self, packet: bytes) -> bytes:
        return self.device.handle_packet(packet)


class MockAvdeccController:
    """
    High-level helper for tests to drive mock packet flows.

    The controller sends framed packets through a transport and parses responses.
    """

    def __init__(self, transport: InMemoryAvdeccTransport):
        self.transport = transport

    def _request(self, message_type: AvdeccMessageType, payload: Dict[str, Any]) -> Dict[str, Any]:
        request = PacketCodec.encode(message_type, payload)
        response = self.transport.exchange(request)
        response_type, response_payload = PacketCodec.decode(response)
        if response_type == AvdeccMessageType.ERROR:
            raise RuntimeError(response_payload.get("reason", "mock device error"))
        return response_payload

    def discover(self) -> Dict[str, Any]:
        return self._request(AvdeccMessageType.ADP_DISCOVER, {})

    def read_descriptor(self, descriptor_type: Any, descriptor_index: int = 0) -> Dict[str, Any]:
        return self._request(
            AvdeccMessageType.AECP_READ_DESCRIPTOR,
            {"descriptor_type": descriptor_type, "descriptor_index": int(descriptor_index)},
        )["descriptor"]

    def get_stream_format(self, direction: str, stream_index: int) -> int:
        return int(
            self._request(
                AvdeccMessageType.AECP_GET_STREAM_FORMAT,
                {"direction": direction, "stream_index": int(stream_index)},
            )["stream_format"]
        )

    def set_stream_format(self, direction: str, stream_index: int, stream_format: int) -> int:
        return int(
            self._request(
                AvdeccMessageType.AECP_SET_STREAM_FORMAT,
                {
                    "direction": direction,
                    "stream_index": int(stream_index),
                    "stream_format": int(stream_format),
                },
            )["stream_format"]
        )

    def connect(self, talker_entity_id: str, talker_stream_index: int, listener_entity_id: str, listener_stream_index: int) -> Dict[str, Any]:
        return self._request(
            AvdeccMessageType.ACMP_CONNECT,
            {
                "talker_entity_id": str(talker_entity_id),
                "talker_stream_index": int(talker_stream_index),
                "listener_entity_id": str(listener_entity_id),
                "listener_stream_index": int(listener_stream_index),
            },
        )

    def disconnect(self, talker_stream_index: int, listener_stream_index: int) -> Dict[str, Any]:
        return self._request(
            AvdeccMessageType.ACMP_DISCONNECT,
            {
                "talker_stream_index": int(talker_stream_index),
                "listener_stream_index": int(listener_stream_index),
            },
        )

    def list_connections(self) -> List[Dict[str, Any]]:
        return list(
            self._request(AvdeccMessageType.ACMP_LIST_CONNECTIONS, {}).get("connections", [])
        )


def raw_socket_available(interface: str = "lo", ethertype: int = 0x88B5) -> Tuple[bool, str]:
    """Best-effort capability check for optional AF_PACKET responder tests."""
    if not hasattr(socket, "AF_PACKET"):
        return False, "AF_PACKET is not available on this platform"
    try:
        sock = socket.socket(socket.AF_PACKET, socket.SOCK_RAW, socket.htons(ethertype))
        try:
            sock.bind((interface, 0))
        finally:
            sock.close()
        return True, ""
    except PermissionError:
        return False, "CAP_NET_RAW or root privileges are required"
    except OSError as exc:
        return False, str(exc)


class RawSocketAvdeccResponder:
    """
    Optional raw responder that serves mock packets over AF_PACKET.

    This is intended for manual/local tests and requires elevated permissions.
    """

    ETH_HEADER_LEN = 14

    def __init__(
        self,
        *,
        device: MockAvdeccDevice,
        interface: str = "lo",
        ethertype: int = 0x88B5,
        source_mac: bytes = b"\x02\x00\x00\x00\x00\x01",
    ):
        if len(source_mac) != 6:
            raise ValueError("source_mac must be exactly 6 bytes")
        self.device = device
        self.interface = interface
        self.ethertype = int(ethertype) & 0xFFFF
        self.source_mac = source_mac
        self._socket: Optional[socket.socket] = None
        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()

    def start(self) -> None:
        if self._socket is not None:
            return
        ok, reason = raw_socket_available(self.interface, self.ethertype)
        if not ok:
            raise RuntimeError(reason)
        sock = socket.socket(socket.AF_PACKET, socket.SOCK_RAW, socket.htons(self.ethertype))
        sock.bind((self.interface, 0))
        self._socket = sock
        self._stop.clear()
        self._thread = threading.Thread(target=self._serve_loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._socket is not None:
            try:
                self._socket.close()
            except OSError:
                pass
        self._socket = None
        if self._thread is not None:
            self._thread.join(timeout=0.5)
        self._thread = None

    def _serve_loop(self) -> None:
        assert self._socket is not None
        while not self._stop.is_set():
            try:
                frame, _addr = self._socket.recvfrom(65535)
            except OSError:
                if self._stop.is_set():
                    break
                continue
            if len(frame) < self.ETH_HEADER_LEN:
                continue
            dest_mac = frame[0:6]
            source_mac = frame[6:12]
            frame_ethertype = int.from_bytes(frame[12:14], byteorder="big", signed=False)
            if frame_ethertype != self.ethertype:
                continue

            payload = frame[self.ETH_HEADER_LEN :]
            response_payload = self.device.handle_packet(payload)
            response_frame = (
                source_mac
                + self.source_mac
                + self.ethertype.to_bytes(2, byteorder="big", signed=False)
                + response_payload
            )
            try:
                self._socket.send(response_frame)
            except OSError:
                continue
