from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Optional

from app.services.event_publisher import EventType, event_publisher

logger = logging.getLogger(__name__)


def _stable_hash(payload: Any) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)


class AvbEventSyncService:
    """Poll AVB runtime state and publish websocket snapshots when it changes."""

    STREAMS_TOPIC = "avb:streams"
    PTP_TOPIC = "avb:ptp"
    AVDECC_TOPIC = "avb:avdecc"

    def __init__(self, poll_interval_seconds: float = 1.0) -> None:
        self.poll_interval_seconds = max(0.25, poll_interval_seconds)
        self._task: Optional[asyncio.Task[None]] = None
        self._stop_event = asyncio.Event()
        self._last_signatures: dict[str, Optional[str]] = {
            self.STREAMS_TOPIC: None,
            self.PTP_TOPIC: None,
            self.AVDECC_TOPIC: None,
        }

    async def start(self) -> None:
        if self._task is not None and not self._task.done():
            return

        self._stop_event = asyncio.Event()
        await self._prime_signatures()
        self._task = asyncio.create_task(self._watch_loop(), name="map2-avb-event-sync")
        logger.info("AVB event sync service started")

    async def stop(self) -> None:
        self._stop_event.set()
        task = self._task
        self._task = None
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        logger.info("AVB event sync service stopped")

    async def check_for_updates(self) -> list[str]:
        return await self.publish_runtime_snapshots(force=False)

    async def publish_runtime_snapshots(
        self,
        *,
        streams: bool = True,
        ptp: bool = True,
        avdecc: bool = True,
        force: bool = False,
    ) -> list[str]:
        published: list[str] = []

        if streams and await self._refresh_topic(self.STREAMS_TOPIC, force=force):
            published.append(self.STREAMS_TOPIC)
        if ptp and await self._refresh_topic(self.PTP_TOPIC, force=force):
            published.append(self.PTP_TOPIC)
        if avdecc and await self._refresh_topic(self.AVDECC_TOPIC, force=force):
            published.append(self.AVDECC_TOPIC)

        return published

    async def _prime_signatures(self) -> None:
        for topic in (self.STREAMS_TOPIC, self.PTP_TOPIC, self.AVDECC_TOPIC):
            try:
                signature, _payload = await self._capture_topic(topic)
            except Exception as exc:
                logger.debug("AVB event sync prime failed for %s: %s", topic, exc)
                continue
            self._last_signatures[topic] = signature

    async def _refresh_topic(self, topic: str, *, force: bool) -> bool:
        signature, payload = await self._capture_topic(topic)
        previous = self._last_signatures.get(topic)

        if not force and previous == signature:
            return False

        await event_publisher.publish(
            topic=topic,
            event_type=self._event_type_for_topic(topic),
            data=payload,
        )
        self._last_signatures[topic] = signature
        return True

    async def _capture_topic(self, topic: str) -> tuple[str, dict[str, Any]]:
        if topic == self.STREAMS_TOPIC:
            return await self._capture_streams_snapshot()
        if topic == self.PTP_TOPIC:
            return await self._capture_ptp_snapshot()
        if topic == self.AVDECC_TOPIC:
            return await self._capture_avdecc_snapshot()
        raise ValueError(f"Unsupported AVB websocket topic: {topic}")

    def _event_type_for_topic(self, topic: str) -> EventType:
        if topic == self.STREAMS_TOPIC:
            return EventType.AVB_STREAMS_UPDATED
        if topic == self.PTP_TOPIC:
            return EventType.AVB_PTP_UPDATED
        if topic == self.AVDECC_TOPIC:
            return EventType.AVB_AVDECC_ENTITIES_UPDATED
        raise ValueError(f"Unsupported AVB websocket topic: {topic}")

    async def _capture_streams_snapshot(self) -> tuple[str, dict[str, Any]]:
        from app.routes import avb as avb_routes

        payload = await avb_routes.get_streams()
        streams = payload.get("streams", [])
        if not isinstance(streams, list):
            streams = []

        normalized_streams: list[dict[str, Any]] = []
        for stream in streams:
            if not isinstance(stream, dict):
                continue
            srp_binding = stream.get("srp_binding")
            if not isinstance(srp_binding, dict):
                srp_binding = {}
            normalized_streams.append(
                {
                    "stream_id": str(stream.get("stream_id") or ""),
                    "direction": str(stream.get("direction") or ""),
                    "state": str(stream.get("state") or ""),
                    "interface": str(stream.get("interface") or ""),
                    "dest_mac": str(stream.get("dest_mac") or ""),
                    "error": stream.get("error"),
                    "srp_reservation_id": srp_binding.get("reservation_id"),
                    "srp_admission_id": srp_binding.get("admission_id"),
                }
            )
        normalized_streams.sort(key=lambda item: (item["stream_id"], item["direction"]))

        signature = _stable_hash(
            {
                "available": bool(payload.get("available", False)),
                "error": payload.get("error"),
                "streams": normalized_streams,
            }
        )
        return signature, payload

    async def _capture_ptp_snapshot(self) -> tuple[str, dict[str, Any]]:
        from app.routes import avb as avb_routes

        payload = await avb_routes.get_ptp_status()
        signature = _stable_hash(
            {
                "available": bool(payload.get("available", False)),
                "state": str(payload.get("state") or ""),
                "grandmaster_id": str(payload.get("grandmaster_id") or ""),
                "error": str(payload.get("error") or ""),
            }
        )
        return signature, payload

    async def _capture_avdecc_snapshot(self) -> tuple[str, dict[str, Any]]:
        from app.routes import avb as avb_routes

        payload = await avb_routes.get_avdecc_entities()
        entities = payload.get("entities", [])
        if not isinstance(entities, list):
            entities = []

        normalized_entities: list[dict[str, Any]] = []
        for entity in entities:
            if not isinstance(entity, dict):
                continue
            capabilities = entity.get("capabilities")
            if not isinstance(capabilities, dict):
                capabilities = {}
            normalized_entities.append(
                {
                    "entity_id": str(entity.get("entity_id") or ""),
                    "entity_name": str(entity.get("entity_name") or ""),
                    "available": bool(entity.get("available", True)),
                    "mac_address": str(entity.get("mac_address") or ""),
                    "source_node_id": str(entity.get("source_node_id") or ""),
                    "talker_streams": int(capabilities.get("talker_streams") or 0),
                    "listener_streams": int(capabilities.get("listener_streams") or 0),
                }
            )
        normalized_entities.sort(key=lambda item: item["entity_id"])

        signature = _stable_hash(
            {
                "enabled": bool(payload.get("enabled", False)),
                "error": payload.get("error"),
                "entities": normalized_entities,
            }
        )
        return signature, payload

    async def _watch_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self.check_for_updates()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("AVB event sync poll failed: %s", exc)

            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=self.poll_interval_seconds)
            except asyncio.TimeoutError:
                continue


_avb_event_sync_service: Optional[AvbEventSyncService] = None


def get_avb_event_sync_service() -> AvbEventSyncService:
    global _avb_event_sync_service
    if _avb_event_sync_service is None:
        _avb_event_sync_service = AvbEventSyncService()
    return _avb_event_sync_service
