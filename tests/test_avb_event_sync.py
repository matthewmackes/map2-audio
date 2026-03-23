import asyncio

from app.routes import avb as avb_routes
from app.services import avb_event_sync
from app.services.avb_event_sync import AvbEventSyncService


def test_check_for_updates_publishes_stream_topic_when_stream_state_changes(monkeypatch):
    async def _run() -> None:
        stream_payloads = [
            {"available": True, "streams": []},
            {
                "available": True,
                "streams": [
                    {
                        "stream_id": "stream-a",
                        "direction": "talker",
                        "state": "running",
                        "interface": "eth0",
                        "dest_mac": "91:e0:f0:00:00:01",
                        "srp_binding": {"reservation_id": "res-1", "admission_id": "adm-1"},
                    }
                ],
            },
        ]
        ptp_payload = {"available": True, "state": "SLAVE", "grandmaster_id": "gm-1"}
        avdecc_payload = {"enabled": True, "entities": []}
        broadcasts: list[tuple[str, str, dict]] = []

        async def fake_get_streams():
            return stream_payloads.pop(0)

        async def fake_get_ptp_status():
            return dict(ptp_payload)

        async def fake_get_avdecc_entities():
            return dict(avdecc_payload)

        async def fake_publish(topic, event_type, data, exclude_client=None):
            broadcasts.append((topic, event_type.value, data))

        monkeypatch.setattr(avb_routes, "get_streams", fake_get_streams)
        monkeypatch.setattr(avb_routes, "get_ptp_status", fake_get_ptp_status)
        monkeypatch.setattr(avb_routes, "get_avdecc_entities", fake_get_avdecc_entities)
        monkeypatch.setattr(avb_event_sync.event_publisher, "publish", fake_publish)

        service = AvbEventSyncService()
        await service._prime_signatures()

        published = await service.check_for_updates()

        assert published == ["avb:streams"]
        assert broadcasts == [
            (
                "avb:streams",
                "avb_streams_updated",
                {
                    "available": True,
                    "streams": [
                        {
                            "stream_id": "stream-a",
                            "direction": "talker",
                            "state": "running",
                            "interface": "eth0",
                            "dest_mac": "91:e0:f0:00:00:01",
                            "srp_binding": {"reservation_id": "res-1", "admission_id": "adm-1"},
                        }
                    ],
                },
            )
        ]

    asyncio.run(_run())


def test_check_for_updates_ignores_ptp_offset_jitter_without_state_transition(monkeypatch):
    async def _run() -> None:
        ptp_payloads = [
            {
                "available": True,
                "state": "SLAVE",
                "grandmaster_id": "gm-1",
                "offset_ns": 17,
                "last_update": "2026-03-23T19:00:00Z",
            },
            {
                "available": True,
                "state": "SLAVE",
                "grandmaster_id": "gm-1",
                "offset_ns": 41,
                "last_update": "2026-03-23T19:00:01Z",
            },
        ]
        broadcasts: list[tuple[str, str]] = []

        async def fake_get_streams():
            return {"available": True, "streams": []}

        async def fake_get_ptp_status():
            return ptp_payloads.pop(0)

        async def fake_get_avdecc_entities():
            return {"enabled": True, "entities": []}

        async def fake_publish(topic, event_type, data, exclude_client=None):
            broadcasts.append((topic, event_type.value))

        monkeypatch.setattr(avb_routes, "get_streams", fake_get_streams)
        monkeypatch.setattr(avb_routes, "get_ptp_status", fake_get_ptp_status)
        monkeypatch.setattr(avb_routes, "get_avdecc_entities", fake_get_avdecc_entities)
        monkeypatch.setattr(avb_event_sync.event_publisher, "publish", fake_publish)

        service = AvbEventSyncService()
        await service._prime_signatures()

        published = await service.check_for_updates()

        assert published == []
        assert broadcasts == []

    asyncio.run(_run())


def test_check_for_updates_publishes_avdecc_topic_when_entities_change(monkeypatch):
    async def _run() -> None:
        avdecc_payloads = [
            {"enabled": True, "entities": []},
            {
                "enabled": True,
                "entities": [
                    {
                        "entity_id": "0000000000000001",
                        "entity_name": "Tesira Forte",
                        "available": True,
                        "mac_address": "00:11:22:33:44:55",
                        "source_node_id": "local-node",
                        "capabilities": {"talker_streams": 1, "listener_streams": 2},
                    }
                ],
            },
        ]
        broadcasts: list[tuple[str, str, dict]] = []

        async def fake_get_streams():
            return {"available": True, "streams": []}

        async def fake_get_ptp_status():
            return {"available": True, "state": "SLAVE", "grandmaster_id": "gm-1"}

        async def fake_get_avdecc_entities():
            return avdecc_payloads.pop(0)

        async def fake_publish(topic, event_type, data, exclude_client=None):
            broadcasts.append((topic, event_type.value, data))

        monkeypatch.setattr(avb_routes, "get_streams", fake_get_streams)
        monkeypatch.setattr(avb_routes, "get_ptp_status", fake_get_ptp_status)
        monkeypatch.setattr(avb_routes, "get_avdecc_entities", fake_get_avdecc_entities)
        monkeypatch.setattr(avb_event_sync.event_publisher, "publish", fake_publish)

        service = AvbEventSyncService()
        await service._prime_signatures()

        published = await service.check_for_updates()

        assert published == ["avb:avdecc"]
        assert broadcasts == [
            (
                "avb:avdecc",
                "avb_avdecc_entities_updated",
                {
                    "enabled": True,
                    "entities": [
                        {
                            "entity_id": "0000000000000001",
                            "entity_name": "Tesira Forte",
                            "available": True,
                            "mac_address": "00:11:22:33:44:55",
                            "source_node_id": "local-node",
                            "capabilities": {"talker_streams": 1, "listener_streams": 2},
                        }
                    ],
                },
            )
        ]

    asyncio.run(_run())
