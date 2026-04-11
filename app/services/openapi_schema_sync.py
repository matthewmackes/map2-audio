from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import FastAPI
from fastapi.routing import APIRoute

from app.services.websocket_manager import ws_manager
from app.utils.singleton import Singleton

logger = logging.getLogger(__name__)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _stable_hash(payload: Any) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def build_route_fingerprint(app: FastAPI) -> str:
    route_identities: list[tuple[Any, ...]] = []

    for route in app.routes:
        if isinstance(route, APIRoute):
            route_identities.append(
                (
                    route.path_format,
                    tuple(sorted(method for method in (route.methods or set()) if method != "HEAD")),
                    route.name,
                    tuple(route.tags or []),
                )
            )
        else:
            route_identities.append(
                (
                    getattr(route, "path", repr(route)),
                    type(route).__name__,
                    getattr(route, "name", ""),
                )
            )

    return _stable_hash(route_identities)


def build_schema_path_signatures(schema: dict[str, Any]) -> dict[str, str]:
    paths = schema.get("paths", {})
    if not isinstance(paths, dict):
        return {}
    return {
        path: _stable_hash(path_item)
        for path, path_item in sorted(paths.items(), key=lambda item: item[0])
    }


def calculate_schema_path_diff(
    previous_paths: dict[str, str] | None,
    current_paths: dict[str, str] | None,
) -> dict[str, list[str]]:
    previous = previous_paths or {}
    current = current_paths or {}

    previous_keys = set(previous)
    current_keys = set(current)
    common = previous_keys & current_keys

    return {
        "added": sorted(current_keys - previous_keys),
        "removed": sorted(previous_keys - current_keys),
        "modified": sorted(path for path in common if previous.get(path) != current.get(path)),
    }


@dataclass
class SchemaSnapshot:
    route_fingerprint: str
    path_signatures: dict[str, str]
    schema_hash: str


class OpenApiSchemaSyncService(Singleton):
    def __init__(self, poll_interval_seconds: float = 5.0) -> None:
        self.poll_interval_seconds = max(0.05, poll_interval_seconds)
        self._app: Optional[FastAPI] = None
        self._task: Optional[asyncio.Task[None]] = None
        self._stop_event = asyncio.Event()
        self._last_snapshot: Optional[SchemaSnapshot] = None

    async def start(self, app: FastAPI) -> None:
        self._app = app
        self._stop_event = asyncio.Event()
        self._last_snapshot = self._capture_snapshot(app, invalidate_schema=True)

        if self._task and not self._task.done():
            return

        self._task = asyncio.create_task(self._watch_loop(), name="map2-openapi-schema-sync")
        logger.info("OpenAPI schema sync service started")

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
        logger.info("OpenAPI schema sync service stopped")

    async def check_for_updates(self) -> dict[str, list[str]] | None:
        if self._app is None:
            return None

        previous = self._last_snapshot
        invalidate_schema = previous is None
        if previous is not None:
            invalidate_schema = build_route_fingerprint(self._app) != previous.route_fingerprint

        current = self._capture_snapshot(self._app, invalidate_schema=invalidate_schema)
        self._last_snapshot = current

        if previous is None:
            return None

        diff = calculate_schema_path_diff(previous.path_signatures, current.path_signatures)
        if not any(diff.values()):
            return None

        await self._broadcast_schema_changed(diff, path_count=len(current.path_signatures))
        return diff

    def _capture_snapshot(self, app: FastAPI, *, invalidate_schema: bool) -> SchemaSnapshot:
        route_fingerprint = build_route_fingerprint(app)
        if invalidate_schema:
            app.openapi_schema = None

        schema = app.openapi()
        path_signatures = build_schema_path_signatures(schema)

        return SchemaSnapshot(
            route_fingerprint=route_fingerprint,
            path_signatures=path_signatures,
            schema_hash=_stable_hash(path_signatures),
        )

    async def _broadcast_schema_changed(self, diff: dict[str, list[str]], *, path_count: int) -> None:
        payload = {
            "type": "schema_changed",
            "topic": "schema_changed",
            "data": {
                "diff": diff,
                "path_count": path_count,
                "last_updated": _utc_now_iso(),
            },
            "timestamp": _utc_now_iso(),
        }
        await ws_manager.broadcast_json(payload, topic="schema_changed")

    async def _watch_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self.check_for_updates()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("OpenAPI schema sync poll failed: %s", exc)

            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=self.poll_interval_seconds)
            except asyncio.TimeoutError:
                continue


def get_openapi_schema_sync_service() -> OpenApiSchemaSyncService:
    return OpenApiSchemaSyncService.get_instance()


def reset_openapi_schema_sync_service() -> None:
    OpenApiSchemaSyncService.reset_instance()
