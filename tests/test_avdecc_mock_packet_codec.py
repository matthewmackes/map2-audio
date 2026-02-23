import pytest

from tests.mock_avdecc_device import AvdeccMessageType, PacketCodec


pytestmark = pytest.mark.avdecc_mock


def test_packet_codec_adp_discover_header_vector():
    packet = PacketCodec.encode(AvdeccMessageType.ADP_DISCOVER, {})

    assert packet[0] == PacketCodec.SUBTYPE
    assert packet[1] == PacketCodec.VERSION
    assert packet[2] == int(AvdeccMessageType.ADP_DISCOVER)
    assert len(packet) == PacketCodec.HEADER.size

    message_type, payload = PacketCodec.decode(packet)
    assert message_type == AvdeccMessageType.ADP_DISCOVER
    assert payload == {}


def test_packet_codec_adp_advertisement_roundtrip_vector():
    payload = {
        "success": True,
        "entity_id": "0011223344556677",
        "entity_model_id": "00aa00bb00cc00dd",
        "firmware_version": "1.2.3-mock",
        "entity_name": "MAP2 Mock AVDECC 8x8",
        "stream_count": 8,
        "profiles": ["8x8", "16x16"],
    }

    packet = PacketCodec.encode(AvdeccMessageType.ADP_ADVERTISEMENT, payload)
    message_type, decoded = PacketCodec.decode(packet)

    assert message_type == AvdeccMessageType.ADP_ADVERTISEMENT
    assert decoded["entity_id"] == payload["entity_id"]
    assert decoded["entity_model_id"] == payload["entity_model_id"]
    assert decoded["firmware_version"] == payload["firmware_version"]
    assert decoded["entity_name"] == payload["entity_name"]
    assert decoded["stream_count"] == payload["stream_count"]
    assert decoded["profiles"] == payload["profiles"]


def test_packet_codec_aecp_stream_format_vectors():
    request_packet = PacketCodec.encode(
        AvdeccMessageType.AECP_SET_STREAM_FORMAT,
        {"direction": "listener", "stream_index": 3, "stream_format": 0x0200000818000005},
    )
    request_type, request_payload = PacketCodec.decode(request_packet)

    assert request_type == AvdeccMessageType.AECP_SET_STREAM_FORMAT
    assert request_payload == {
        "direction": "listener",
        "stream_index": 3,
        "stream_format": 0x0200000818000005,
    }

    response_packet = PacketCodec.encode(
        AvdeccMessageType.AECP_SET_STREAM_FORMAT,
        {
            "success": True,
            "direction": "listener",
            "stream_index": 3,
            "stream_format": 0x0200000818000005,
        },
    )
    response_type, response_payload = PacketCodec.decode(response_packet)

    assert response_type == AvdeccMessageType.AECP_SET_STREAM_FORMAT
    assert response_payload["success"] is True
    assert response_payload["direction"] == "listener"
    assert response_payload["stream_index"] == 3
    assert response_payload["stream_format"] == 0x0200000818000005


def test_packet_codec_acmp_connection_vectors():
    connect_request = {
        "talker_entity_id": "0011223344556677",
        "talker_stream_index": 1,
        "listener_entity_id": "0011223344556677",
        "listener_stream_index": 5,
    }
    request_packet = PacketCodec.encode(AvdeccMessageType.ACMP_CONNECT, connect_request)
    request_type, request_payload = PacketCodec.decode(request_packet)

    assert request_type == AvdeccMessageType.ACMP_CONNECT
    assert request_payload == connect_request

    connections = [
        {
            "talker_entity_id": "0011223344556677",
            "talker_stream_index": 1,
            "listener_entity_id": "0011223344556677",
            "listener_stream_index": 5,
        },
        {
            "talker_entity_id": "0011223344556677",
            "talker_stream_index": 2,
            "listener_entity_id": "0011223344556677",
            "listener_stream_index": 6,
        },
    ]
    list_packet = PacketCodec.encode(
        AvdeccMessageType.ACMP_LIST_CONNECTIONS,
        {"success": True, "connections": connections},
    )
    list_type, list_payload = PacketCodec.decode(list_packet)

    assert list_type == AvdeccMessageType.ACMP_LIST_CONNECTIONS
    assert list_payload["success"] is True
    assert list_payload["connections"] == connections


def test_packet_codec_error_vector_roundtrip():
    packet = PacketCodec.encode(
        AvdeccMessageType.ERROR,
        {"success": False, "status": "bad_packet", "reason": "incomplete packet payload"},
    )

    message_type, payload = PacketCodec.decode(packet)

    assert message_type == AvdeccMessageType.ERROR
    assert payload["success"] is False
    assert payload["status"] == "bad_packet"
    assert payload["reason"] == "incomplete packet payload"
