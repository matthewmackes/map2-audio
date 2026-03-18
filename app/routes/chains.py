"""
Signal Chain Route Handlers with Database Persistence
API endpoints for creating and managing audio signal chains.
"""

import hashlib
import json
import asyncio
import time
import threading

try:
    from fastapi import APIRouter, HTTPException, Query, Body, Request, Response
    from pydantic import BaseModel
    from typing import List
    from app.services.api_readiness import ensure_chain_route_ready
    from app.services.chain_service import ChainService
    from app.services.event_publisher import event_publisher, EventType

    router = APIRouter(prefix="/api/chains", tags=["chains"])

    class ChainCreate(BaseModel):
        name: str

    class ChainUpdate(BaseModel):
        name: str = None
        is_active: bool = None

    class ChainDeployRequest(BaseModel):
        chain_id: int
        chain_name: str
        plugins: List[dict] = []
        mode: str = "active"  # active | standby
        activate: bool = True

    class TouchscreenStompAssignment(BaseModel):
        slot: int
        plugin_uri: str
        plugin_position: int

    class TouchscreenStompAssignmentsRequest(BaseModel):
        assignments: List[TouchscreenStompAssignment] = []

    _CHAIN_ROUTE_TIMEOUT_SECONDS = 0.09
    _CHAIN_LIST_CACHE_TTL_SECONDS = 30.0
    _CHAIN_DETAILS_CACHE_TTL_SECONDS = 30.0
    _CHAIN_TOGGLE_MIN_INTERVAL_SECONDS = 0.45
    _CHAIN_HTTP_CACHE_CONTROL = "no-store"
    _chain_list_cache = None
    _chain_list_cache_etag = None
    _chain_list_cache_at = 0.0
    _chain_list_cache_lock = threading.Lock()
    _chain_list_refresh_lock = None
    _chain_details_cache: dict[int, tuple[float, dict]] = {}
    _chain_details_cache_lock = threading.Lock()
    _chain_details_refresh_locks: dict[int, asyncio.Lock] = {}
    _chain_details_refresh_locks_lock = threading.Lock()
    _chain_toggle_at: dict[int, float] = {}
    _chain_toggle_lock = threading.Lock()

    def _normalize_deploy_plugins(plugins: List[dict]) -> List[dict]:
        """Normalize deploy payload plugins into DB-ready entries."""
        normalized = []
        for index, plugin in enumerate(plugins or []):
            if not isinstance(plugin, dict):
                continue

            uri = plugin.get("uri") or plugin.get("plugin_uri")
            if not isinstance(uri, str) or not uri.strip():
                continue

            normalized.append({
                "uri": uri.strip(),
                "position": index,
                "bypass": bool(plugin.get("bypassed", plugin.get("bypass", False))),
            })

        return normalized

    def validate_chain_name(name: str) -> bool:
        """Validate chain name (1-256 characters)."""
        return name and isinstance(name, str) and 1 <= len(name) <= 256

    def _allow_chain_toggle(chain_id: int) -> bool:
        now = time.monotonic()
        with _chain_toggle_lock:
            last = _chain_toggle_at.get(chain_id, 0.0)
            if (now - last) < _CHAIN_TOGGLE_MIN_INTERVAL_SECONDS:
                return False
            _chain_toggle_at[chain_id] = now
        return True

    def _get_chain_list_refresh_lock() -> asyncio.Lock:
        global _chain_list_refresh_lock
        if _chain_list_refresh_lock is None:
            _chain_list_refresh_lock = asyncio.Lock()
        return _chain_list_refresh_lock

    def _open_read_session(get_session_factory):
        try:
            return get_session_factory(read_only=True)
        except TypeError:
            # Backward-compat for tests/mocks that expose a no-arg factory.
            return get_session_factory()

    def _get_chain_details_refresh_lock(chain_id: int) -> asyncio.Lock:
        with _chain_details_refresh_locks_lock:
            lock = _chain_details_refresh_locks.get(chain_id)
            if lock is None:
                lock = asyncio.Lock()
                _chain_details_refresh_locks[chain_id] = lock
            return lock

    def _chain_list_etag(payload: dict) -> str:
        return '"' + hashlib.sha256(
            json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest() + '"'

    def _get_cached_chain_details(chain_id: int):
        now = time.monotonic()
        with _chain_details_cache_lock:
            cached = _chain_details_cache.get(chain_id)
            if not cached:
                return None
            cached_at, payload = cached
            if (now - cached_at) > _CHAIN_DETAILS_CACHE_TTL_SECONDS:
                return None
            return dict(payload)

    def _get_stale_chain_details(chain_id: int):
        with _chain_details_cache_lock:
            cached = _chain_details_cache.get(chain_id)
            if not cached:
                return None
            return dict(cached[1])

    def _set_cached_chain_details(chain_id: int, payload: dict) -> None:
        with _chain_details_cache_lock:
            _chain_details_cache[chain_id] = (time.monotonic(), dict(payload))

    def _deferred_chain_payload(chain_id: int) -> dict:
        return {
            "id": chain_id,
            "name": f"Chain {chain_id}",
            "is_active": False,
            "plugins": [],
            "effects_loops": [],
            "loop_insertions": [],
            "deferred": True,
        }

    def _refresh_chain_state_cache(chain_id: int, is_active: bool) -> None:
        global _chain_list_cache, _chain_list_cache_etag, _chain_list_cache_at
        with _chain_details_cache_lock:
            cached = _chain_details_cache.get(chain_id)
            if cached:
                _, payload = cached
                updated = dict(payload)
                updated["is_active"] = is_active
                _chain_details_cache[chain_id] = (time.monotonic(), updated)

        with _chain_list_cache_lock:
            if not isinstance(_chain_list_cache, dict):
                return
            chains = _chain_list_cache.get("chains")
            if not isinstance(chains, list):
                return

            updated_chains = []
            changed = False
            for chain in chains:
                if isinstance(chain, dict) and chain.get("id") == chain_id:
                    updated_chain = dict(chain)
                    updated_chain["is_active"] = is_active
                    updated_chains.append(updated_chain)
                    changed = True
                else:
                    updated_chains.append(chain)

            if not changed:
                return

            payload = dict(_chain_list_cache)
            payload["chains"] = updated_chains
            _chain_list_cache = payload
            _chain_list_cache_etag = _chain_list_etag(payload)
            _chain_list_cache_at = time.monotonic()

    def _invalidate_chain_list_cache() -> None:
        global _chain_list_cache, _chain_list_cache_etag, _chain_list_cache_at
        with _chain_list_cache_lock:
            _chain_list_cache = None
            _chain_list_cache_etag = None
            _chain_list_cache_at = 0.0

    def _invalidate_chain_details_cache(chain_id: int | None = None) -> None:
        with _chain_details_cache_lock:
            if chain_id is None:
                _chain_details_cache.clear()
                return
            _chain_details_cache.pop(chain_id, None)

    def _invalidate_chain_cache(chain_id: int | None = None) -> None:
        _invalidate_chain_list_cache()
        _invalidate_chain_details_cache(chain_id)

    def _schedule_chain_event(channel: str, event_type: EventType, payload: dict) -> None:
        async def _publish() -> None:
            try:
                await event_publisher.publish(channel, event_type, payload)
            except Exception:
                pass

        asyncio.create_task(_publish())

    @router.get("/")
    async def list_chains(request: Request, response: Response):
        """List all signal chains from database."""
        ensure_chain_route_ready("/api/chains/")
        global _chain_list_cache, _chain_list_cache_etag, _chain_list_cache_at
        now = time.monotonic()
        with _chain_list_cache_lock:
            cache_fresh = (
                _chain_list_cache is not None
                and (now - _chain_list_cache_at) < _CHAIN_LIST_CACHE_TTL_SECONDS
            )
            if cache_fresh:
                payload = _chain_list_cache
                etag = _chain_list_cache_etag
            else:
                payload = None
                etag = None

        if payload is not None and etag is not None:
            response.headers["Cache-Control"] = _CHAIN_HTTP_CACHE_CONTROL
            response.headers["ETag"] = etag
            if request.headers.get("if-none-match") == etag:
                return Response(
                    status_code=304,
                    headers={
                        "Cache-Control": _CHAIN_HTTP_CACHE_CONTROL,
                        "ETag": etag,
                    },
                )
            return payload

        refresh_lock = _get_chain_list_refresh_lock()
        if refresh_lock.locked():
            with _chain_list_cache_lock:
                stale_payload = _chain_list_cache
                stale_etag = _chain_list_cache_etag
            if stale_payload is not None and stale_etag is not None:
                response.headers["Cache-Control"] = _CHAIN_HTTP_CACHE_CONTROL
                response.headers["ETag"] = stale_etag
                response.headers["X-Chain-Cache-Stale"] = "1"
                return stale_payload

        # Single-flight cache refresh: concurrent misses wait on one DB fetch.
        async with refresh_lock:
            now = time.monotonic()
            with _chain_list_cache_lock:
                cache_fresh = (
                    _chain_list_cache is not None
                    and (now - _chain_list_cache_at) < _CHAIN_LIST_CACHE_TTL_SECONDS
                )
                if cache_fresh:
                    payload = _chain_list_cache
                    etag = _chain_list_cache_etag
                else:
                    payload = None
                    etag = None

            if payload is None or etag is None:
                from app.database import get_session
                chains = None
                try:
                    async with _open_read_session(get_session) as session:
                        service = ChainService(session)
                        try:
                            chains = await asyncio.wait_for(
                                service.list_chains(),
                                timeout=_CHAIN_ROUTE_TIMEOUT_SECONDS,
                            )
                        except asyncio.TimeoutError:
                            try:
                                await session.rollback()
                            except Exception:
                                pass
                        except Exception:
                            try:
                                await session.rollback()
                            except Exception:
                                pass
                except Exception:
                    chains = None

                if chains is None:
                    with _chain_list_cache_lock:
                        stale_payload = _chain_list_cache
                        stale_etag = _chain_list_cache_etag
                    if stale_payload is not None and stale_etag is not None:
                        response.headers["Cache-Control"] = _CHAIN_HTTP_CACHE_CONTROL
                        response.headers["ETag"] = stale_etag
                        response.headers["X-Chain-Cache-Stale"] = "1"
                        return stale_payload
                    return {"chains": [], "count": 0, "deferred": True}

                payload = {"chains": chains, "count": len(chains)}
                etag = _chain_list_etag(payload)

                with _chain_list_cache_lock:
                    _chain_list_cache = payload
                    _chain_list_cache_etag = etag
                    _chain_list_cache_at = time.monotonic()

        response.headers["Cache-Control"] = _CHAIN_HTTP_CACHE_CONTROL
        response.headers["ETag"] = etag

        if request.headers.get("if-none-match") == etag:
            return Response(
                status_code=304,
                headers={
                    "Cache-Control": _CHAIN_HTTP_CACHE_CONTROL,
                    "ETag": etag,
                },
            )

        return payload

    @router.post("/")
    async def create_chain(chain: ChainCreate):
        """Create new signal chain with database persistence.

        Request Body:
            name: Chain name (1-256 characters)
        """
        if not validate_chain_name(chain.name):
            raise HTTPException(status_code=400, detail="Chain name must be 1-256 characters")

        from app.database import get_session
        async with get_session() as session:
            service = ChainService(session)
            result = await service.create_chain(chain.name)
            if result is None:
                raise HTTPException(status_code=400, detail="Failed to create chain")

        _invalidate_chain_cache(result["id"])

        # Publish chain creation event AFTER session commits
        await event_publisher.publish(
            "chain_updates",
            EventType.CHAIN_CREATED,
            {"chain_id": result["id"], "name": result["name"]}
        )

        return result

    @router.get("/presets")
    async def list_presets():
        """List all saved presets."""
        from app.database import get_session
        async with get_session() as session:
            service = ChainService(session)
            presets = await service.list_presets()
            return {"presets": presets, "count": len(presets)}

    @router.post("/preset/{preset_id}/load")
    async def load_chain_preset(preset_id: int):
        """Load chain from preset.

        Args:
            preset_id: Preset ID to load

        Returns:
            New chain ID created from preset
        """
        from app.database import get_session
        async with get_session() as session:
            service = ChainService(session)
            chain_id = await service.load_preset(preset_id)
            if not chain_id:
                raise HTTPException(status_code=404, detail="Preset not found or load failed")

        _invalidate_chain_cache(chain_id)

        # Publish preset loaded event AFTER session commits
        await event_publisher.publish(
            "chain_updates",
            EventType.PRESET_LOADED,
            {"preset_id": preset_id, "chain_id": chain_id}
        )

        return {"status": "preset_loaded", "chain_id": chain_id}

    @router.delete("/preset/{preset_id}")
    async def delete_preset(preset_id: int):
        """Delete a preset."""
        from app.database import get_session
        async with get_session() as session:
            service = ChainService(session)
            success = await service.delete_preset(preset_id)
            if not success:
                raise HTTPException(status_code=404, detail="Preset not found")
            return {"status": "preset_deleted", "preset_id": preset_id}

    @router.get("/{chain_id}")
    async def get_chain(chain_id: int):
        """Get signal chain details."""
        ensure_chain_route_ready("/api/chains/{id}")
        cached = _get_cached_chain_details(chain_id)
        if cached is not None:
            return cached

        refresh_lock = _get_chain_details_refresh_lock(chain_id)
        stale = _get_stale_chain_details(chain_id)
        if refresh_lock.locked():
            if stale is not None:
                stale["stale"] = True
                return stale
            return _deferred_chain_payload(chain_id)

        deferred_payload = _deferred_chain_payload(chain_id)

        from app.database import get_session
        async with refresh_lock:
            cached = _get_cached_chain_details(chain_id)
            if cached is not None:
                return cached

            try:
                async with _open_read_session(get_session) as session:
                    service = ChainService(session)
                    try:
                        result = await asyncio.wait_for(
                            service.get_chain(chain_id),
                            timeout=_CHAIN_ROUTE_TIMEOUT_SECONDS,
                        )
                    except asyncio.TimeoutError:
                        try:
                            await session.rollback()
                        except Exception:
                            pass
                        stale = _get_stale_chain_details(chain_id)
                        if stale is not None:
                            stale["stale"] = True
                            return stale
                        _set_cached_chain_details(chain_id, deferred_payload)
                        return deferred_payload
                    except Exception:
                        try:
                            await session.rollback()
                        except Exception:
                            pass
                        stale = _get_stale_chain_details(chain_id)
                        if stale is not None:
                            stale["stale"] = True
                            return stale
                        _set_cached_chain_details(chain_id, deferred_payload)
                        return deferred_payload
            except Exception:
                stale = _get_stale_chain_details(chain_id)
                if stale is not None:
                    stale["stale"] = True
                    return stale
                _set_cached_chain_details(chain_id, deferred_payload)
                return deferred_payload

            if result is None:
                raise HTTPException(status_code=404, detail="Chain not found")

            _set_cached_chain_details(chain_id, result)
            return result

    @router.get("/{chain_id}/touchscreen")
    async def get_chain_touchscreen_state(chain_id: int):
        """Get persisted touchscreen state for a chain."""
        from app.database import get_session

        async with get_session() as session:
            service = ChainService(session)
            result = await service.get_touchscreen_state(chain_id)
            if result is None:
                raise HTTPException(status_code=404, detail="Chain not found")
            return result

    @router.put("/{chain_id}/touchscreen/stomps")
    async def update_chain_touchscreen_stomps(
        chain_id: int,
        request: TouchscreenStompAssignmentsRequest,
    ):
        """Persist touchscreen stomp slot assignments for a chain."""
        from app.database import get_session

        assignments = [
            {
                "slot": assignment.slot,
                "plugin_uri": assignment.plugin_uri,
                "plugin_position": assignment.plugin_position,
            }
            for assignment in request.assignments
        ]

        async with get_session() as session:
            service = ChainService(session)
            result = await service.set_touchscreen_stomp_assignments(chain_id, assignments)
            if result is None:
                raise HTTPException(status_code=404, detail="Chain not found")

        _invalidate_chain_cache(chain_id)
        return result

    @router.get("/{chain_id}/analysis")
    async def get_chain_analysis(chain_id: int):
        """Get estimated resource requirements for a chain."""
        from app.database import get_session
        from app.services.chain_analyzer import ChainAnalyzer

        async with get_session() as session:
            analyzer = ChainAnalyzer(ChainService(session))
            analysis = await analyzer.analyze_chain(chain_id)

        if analysis is None:
            raise HTTPException(status_code=404, detail="Chain not found")
        return analysis

    @router.post("/{chain_id}/plugins")
    async def add_plugin_to_chain(chain_id: int, plugin_uri: str = Query(..., description="Plugin URI string")):
        """Add plugin to signal chain.

        Args:
            chain_id: Signal chain ID
            plugin_uri: Plugin URI string (query parameter)
        """
        if not plugin_uri or not isinstance(plugin_uri, str):
            raise HTTPException(status_code=400, detail="Plugin URI must be a non-empty string")

        import logging
        from sqlalchemy import func, select
        from app.database import ChainPlugin, get_session

        logger = logging.getLogger(__name__)

        try:
            logger.info("add_plugin route: chain_id=%s, plugin_uri=%s", chain_id, plugin_uri)

            async with get_session() as session:
                service = ChainService(session)
                added = await service.add_plugin_to_chain(chain_id, plugin_uri)
                if not added:
                    raise HTTPException(status_code=404, detail=f"Chain {chain_id} not found or plugin add failed")

                plugin_position = (
                    await session.execute(
                        select(ChainPlugin.position)
                        .filter(
                            ChainPlugin.chain_id == chain_id,
                            ChainPlugin.plugin_uri == plugin_uri,
                        )
                        .order_by(ChainPlugin.position.desc())
                        .limit(1)
                    )
                ).scalars().first()
                plugins_count = (
                    await session.execute(
                        select(func.count())
                        .select_from(ChainPlugin)
                        .filter(ChainPlugin.chain_id == chain_id)
                    )
                ).scalar_one()

            _invalidate_chain_cache(chain_id)

            # Publish plugin added event AFTER session commits
            await event_publisher.publish(
                "plugin_params",
                EventType.PLUGIN_ADDED,
                {
                    "chain_id": chain_id,
                    "plugin_uri": plugin_uri,
                    "plugin_position": plugin_position,
                }
            )

            return {
                "status": "plugin_added",
                "chain_id": chain_id,
                "plugin": plugin_uri,
                "plugins_count": plugins_count,
                "plugin_position": plugin_position,
            }
        except HTTPException:
            raise
        except Exception as e:
            import traceback
            logger.error(f"Error: {str(e)}\n{traceback.format_exc()}")
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/{chain_id}/plugins")
    async def remove_plugin_from_chain(
        chain_id: int,
        plugin_uri: str = Query(..., description="Plugin URI to remove"),
        plugin_position: int | None = Query(None, ge=0, description="Specific plugin position to remove"),
    ):
        """Remove plugin from signal chain.

        Args:
            chain_id: Signal chain ID
            plugin_uri: Plugin URI string (query parameter)
            plugin_position: Optional plugin position for removing a single matching instance
        """
        if not plugin_uri or not isinstance(plugin_uri, str):
            raise HTTPException(status_code=400, detail="Plugin URI must be a non-empty string")

        import logging
        logger = logging.getLogger(__name__)

        logger.info(
            "DELETE_ENDPOINT: removing plugin from chain_id=%s, plugin_uri=%s, plugin_position=%s",
            chain_id,
            plugin_uri,
            plugin_position,
        )

        from app.database import get_session

        try:
            async with get_session() as session:
                service = ChainService(session)
                deletion_succeeded = await service.remove_plugin_from_chain(
                    chain_id,
                    plugin_uri,
                    plugin_position=plugin_position,
                )

                if not deletion_succeeded:
                    raise HTTPException(status_code=404, detail="Service failed to remove plugin")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"DELETE_ENDPOINT: Unexpected exception: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Failed to delete plugin")

        _invalidate_chain_cache(chain_id)
        
        # Publish event
        await event_publisher.publish(
            "plugin_params",
            EventType.PLUGIN_REMOVED,
            {"chain_id": chain_id, "plugin_uri": plugin_uri, "plugin_position": plugin_position}
        )

        return {"status": "plugin_removed", "chain_id": chain_id, "plugin_position": plugin_position}

    @router.post("/{chain_id}/activate")
    async def activate_chain(chain_id: int):
        """Activate signal chain."""
        ensure_chain_route_ready("/api/chains/{id}/activate")
        if not _allow_chain_toggle(chain_id):
            return {"status": "activate_throttled", "chain_id": chain_id, "deferred": True}

        from app.database import get_session
        try:
            async with get_session() as session:
                service = ChainService(session)
                try:
                    success = await asyncio.wait_for(
                        service.activate_chain(chain_id),
                        timeout=_CHAIN_ROUTE_TIMEOUT_SECONDS,
                    )
                except asyncio.TimeoutError:
                    try:
                        await session.rollback()
                    except Exception:
                        pass
                    return {"status": "activate_deferred", "chain_id": chain_id, "deferred": True}
                except Exception:
                    try:
                        await session.rollback()
                    except Exception:
                        pass
                    return {"status": "activate_deferred", "chain_id": chain_id, "deferred": True}
                if not success:
                    raise HTTPException(status_code=404, detail="Chain not found")
        except HTTPException:
            raise
        except Exception:
            return {"status": "activate_deferred", "chain_id": chain_id, "deferred": True}

        _refresh_chain_state_cache(chain_id, True)
        _schedule_chain_event("chain_updates", EventType.CHAIN_ACTIVATED, {"chain_id": chain_id})

        return {"status": "activated", "chain_id": chain_id}

    @router.post("/{chain_id}/deactivate")
    async def deactivate_chain(chain_id: int):
        """Deactivate signal chain."""
        ensure_chain_route_ready("/api/chains/{id}/deactivate")
        if not _allow_chain_toggle(chain_id):
            return {"status": "deactivate_throttled", "chain_id": chain_id, "deferred": True}

        from app.database import get_session
        try:
            async with get_session() as session:
                service = ChainService(session)
                try:
                    success = await asyncio.wait_for(
                        service.deactivate_chain(chain_id),
                        timeout=_CHAIN_ROUTE_TIMEOUT_SECONDS,
                    )
                except asyncio.TimeoutError:
                    try:
                        await session.rollback()
                    except Exception:
                        pass
                    return {"status": "deactivate_deferred", "chain_id": chain_id, "deferred": True}
                except Exception:
                    try:
                        await session.rollback()
                    except Exception:
                        pass
                    return {"status": "deactivate_deferred", "chain_id": chain_id, "deferred": True}
                if not success:
                    raise HTTPException(status_code=404, detail="Chain not found")
        except HTTPException:
            raise
        except Exception:
            return {"status": "deactivate_deferred", "chain_id": chain_id, "deferred": True}

        _refresh_chain_state_cache(chain_id, False)
        _schedule_chain_event("chain_updates", EventType.CHAIN_DEACTIVATED, {"chain_id": chain_id})

        return {"status": "deactivated", "chain_id": chain_id}

    @router.delete("/{chain_id}")
    async def delete_chain(chain_id: int):
        """Delete signal chain."""
        from app.database import get_session
        async with get_session() as session:
            service = ChainService(session)
            success = await service.delete_chain(chain_id)
            if not success:
                raise HTTPException(status_code=404, detail="Chain not found")

        _invalidate_chain_cache(chain_id)

        # Publish chain deletion event AFTER session commits
        # This prevents race conditions where WebSocket listeners refetch
        # before the transaction is committed
        await event_publisher.publish(
            "chain_updates",
            EventType.CHAIN_DELETED,
            {"chain_id": chain_id}
        )

        return {"status": "deleted", "chain_id": chain_id}

    @router.put("/{chain_id}/rename")
    async def rename_chain(chain_id: int, new_name: str):
        """Rename a signal chain."""
        if not validate_chain_name(new_name):
            raise HTTPException(status_code=400, detail="Chain name must be 1-256 characters")

        from app.database import get_session
        async with get_session() as session:
            service = ChainService(session)
            success = await service.rename_chain(chain_id, new_name)
            if not success:
                raise HTTPException(status_code=404, detail="Chain not found")

        _invalidate_chain_cache(chain_id)

        # Publish chain rename event AFTER session commits
        await event_publisher.publish(
            "chain_updates",
            EventType.CHAIN_RENAMED,
            {"chain_id": chain_id, "name": new_name}
        )

        return {"status": "renamed", "chain_id": chain_id, "name": new_name}

    @router.post("/{chain_id}/reorder")
    async def reorder_plugins(chain_id: int, plugin_uris: List[str] = Body(..., description="Ordered list of plugin URIs")):
        """Reorder plugins in chain.

        Args:
            chain_id: Signal chain ID
            plugin_uris: Ordered list of plugin URIs (request body)
        """
        from app.database import get_session
        
        if not plugin_uris or not isinstance(plugin_uris, list):
            raise HTTPException(status_code=400, detail="plugin_uris must be a non-empty list")
        
        async with get_session() as session:
            service = ChainService(session)
            success = await service.reorder_plugins(chain_id, plugin_uris)
            if not success:
                raise HTTPException(status_code=400, detail="Failed to reorder plugins")

        _invalidate_chain_cache(chain_id)
        return {"status": "reordered", "chain_id": chain_id, "plugins": plugin_uris}

    @router.post("/{chain_id}/plugins/{plugin_uri}/bypass")
    async def toggle_plugin_bypass(
        chain_id: int,
        plugin_uri: str,
        bypass: bool,
        plugin_position: int | None = Query(None, ge=0, description="Specific plugin position to bypass"),
    ):
        """Toggle plugin bypass state.

        Args:
            chain_id: Signal chain ID
            plugin_uri: Plugin URI
            bypass: True to bypass, False to enable
            plugin_position: Optional plugin position to disambiguate duplicate URIs
        """
        from app.database import get_session
        async with get_session() as session:
            service = ChainService(session)
            success = await service.set_plugin_bypass(
                chain_id,
                plugin_uri,
                bypass,
                plugin_position=plugin_position,
            )
            if not success:
                raise HTTPException(status_code=404, detail="Chain or plugin not found")

        _invalidate_chain_cache(chain_id)

        # Publish plugin bypass event AFTER session commits
        await event_publisher.publish(
            "plugin_params",
            EventType.PLUGIN_BYPASSED,
            {
                "chain_id": chain_id,
                "plugin_uri": plugin_uri,
                "plugin_position": plugin_position,
                "bypass": bypass,
            },
        )

        return {
            "status": "bypass_updated",
            "chain_id": chain_id,
            "plugin": plugin_uri,
            "plugin_position": plugin_position,
            "bypass": bypass,
        }

    @router.post("/{chain_id}/preset/save")
    async def save_chain_preset(chain_id: int, preset_name: str):
        """Save chain configuration as preset.

        Args:
            chain_id: Signal chain ID
            preset_name: Name for the preset
        """
        if not preset_name or len(preset_name) < 1 or len(preset_name) > 256:
            raise HTTPException(status_code=400, detail="Preset name must be 1-256 characters")

        from app.database import get_session
        async with get_session() as session:
            service = ChainService(session)
            preset_id = await service.save_preset(chain_id, preset_name)
            if not preset_id:
                raise HTTPException(status_code=404, detail="Chain not found or save failed")
            return {"status": "preset_saved", "preset_id": preset_id, "name": preset_name}

    # ==================== CLUSTER DEPLOYMENT ====================

    @router.post("/deploy")
    async def deploy_chain(request: ChainDeployRequest):
        """Deploy a chain configuration to this node (cluster use).

        This endpoint is called by the management node to stage/update a
        chain definition on a target node and optionally activate it in
        the local audio engine.
        """
        if request.chain_id is None:
            raise HTTPException(status_code=400, detail="chain_id required")
        if request.mode not in {"active", "standby"}:
            raise HTTPException(status_code=400, detail="mode must be 'active' or 'standby'")

        from sqlalchemy import select, delete
        from app.database import get_session, Chain, ChainPlugin
        from app.services.juce_engine_service import get_audio_engine

        normalized_plugins = _normalize_deploy_plugins(request.plugins)
        chain_name = (request.chain_name or f"Chain {request.chain_id}").strip()[:255] or f"Chain {request.chain_id}"

        try:
            # Stage chain state in local DB (upsert chain + replace plugin list).
            async with get_session() as session:
                chain_result = await session.execute(
                    select(Chain).filter(Chain.id == request.chain_id)
                )
                chain = chain_result.scalar_one_or_none()

                if chain is None:
                    chain = Chain(
                        id=request.chain_id,
                        name=chain_name,
                        is_active=False,
                    )
                    session.add(chain)
                    await session.flush()
                else:
                    chain.name = chain_name
                    chain.is_active = False
                    await session.flush()

                await session.execute(
                    delete(ChainPlugin).where(ChainPlugin.chain_id == request.chain_id)
                )

                for plugin in normalized_plugins:
                    session.add(
                        ChainPlugin(
                            chain_id=request.chain_id,
                            plugin_uri=plugin["uri"],
                            position=plugin["position"],
                            bypass=plugin["bypass"],
                        )
                    )
                await session.flush()

            activated = False
            message = "Chain staged on node"
            status = "staged"
            applied = True

            # Activate only when explicitly requested for active mode.
            if request.activate and request.mode == "active":
                engine_service = get_audio_engine()
                if engine_service is None or getattr(engine_service, "_engine", None) is None:
                    return {
                        "status": "failed",
                        "applied": False,
                        "message": "Chain staged, but audio engine is not initialized",
                        "chain_id": request.chain_id,
                        "chain_name": chain_name,
                        "plugin_count": len(normalized_plugins),
                        "mode": request.mode,
                        "activate": request.activate,
                    }

                async with get_session() as session:
                    service = ChainService(session)
                    activated = await service.activate_chain(request.chain_id)

                if not activated:
                    return {
                        "status": "failed",
                        "applied": False,
                        "message": "Chain staged, but activation failed",
                        "chain_id": request.chain_id,
                        "chain_name": chain_name,
                        "plugin_count": len(normalized_plugins),
                        "mode": request.mode,
                        "activate": request.activate,
                    }

                deployed_count = None
                try:
                    pedalboard = await engine_service.get_current_pedalboard()
                    if isinstance(pedalboard, dict):
                        if isinstance(pedalboard.get("items"), list):
                            deployed_count = len(pedalboard["items"])
                        elif isinstance(pedalboard.get("plugins"), list):
                            deployed_count = len(pedalboard["plugins"])
                except Exception:
                    pass

                if (
                    deployed_count is not None
                    and len(normalized_plugins) > 0
                    and deployed_count < len(normalized_plugins)
                ):
                    return {
                        "status": "failed",
                        "applied": False,
                        "message": (
                            f"Chain staged, but engine deployment is incomplete "
                            f"({deployed_count}/{len(normalized_plugins)} plugins)"
                        ),
                        "chain_id": request.chain_id,
                        "chain_name": chain_name,
                        "plugin_count": len(normalized_plugins),
                        "mode": request.mode,
                        "activate": request.activate,
                    }

                status = "deployed"
                message = "Chain deployed and activated on node"

            return {
                "status": status,
                "applied": applied,
                "message": message,
                "chain_id": request.chain_id,
                "chain_name": chain_name,
                "plugin_count": len(normalized_plugins),
                "mode": request.mode,
                "activate": request.activate,
                "activated": activated,
            }

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Deployment failed: {e}")

    # ==================== TEMPLATES (DEMO PEDALBOARDS) ====================

    @router.get("/templates/list")
    async def list_templates():
        """List available chain templates (demo pedalboards).

        Returns:
            List of templates with name, description, plugin_count
        """
        from app.database import get_session
        async with get_session() as session:
            service = ChainService(session)
            templates = await service.list_templates()
            return {"templates": templates, "count": len(templates)}

    @router.post("/templates/load")
    async def load_template(template_name: str):
        """Create a chain from a template (demo pedalboard).

        Args:
            template_name: Name of the template (e.g., "Rock Distortion")

        Returns:
            Created chain with plugins
        """
        if not template_name:
            raise HTTPException(status_code=400, detail="Template name is required")

        from app.database import get_session
        async with get_session() as session:
            service = ChainService(session)
            chain = await service.create_chain_from_template(template_name)
            if not chain:
                raise HTTPException(status_code=404, detail=f"Template '{template_name}' not found")
            return {
                "status": "template_loaded",
                "chain": chain
            }

    # ========================================
    # Lexicon MPX-1 Hardware Plugin Endpoints
    # ========================================

    @router.post("/lexicon/calibrate")
    async def calibrate_lexicon():
        """Calibrate S/PDIF round-trip latency for Lexicon MPX-1."""
        from app.services.juce_engine_service import JuceEngineService
        engine = JuceEngineService()
        result = await engine.calibrate_lexicon_latency()
        return {"success": result}

    @router.post("/lexicon/mix")
    async def set_lexicon_mix(body: dict = Body(...)):
        """Set Lexicon MPX-1 wet/dry mix (0.0=dry, 1.0=wet)."""
        from app.services.juce_engine_service import JuceEngineService
        engine = JuceEngineService()
        mix = float(body.get("mix", 1.0))
        result = await engine.set_lexicon_mix(mix)
        return {"success": result, "mix": mix}

    @router.post("/lexicon/bypass")
    async def set_lexicon_bypass(body: dict = Body(...)):
        """Set Lexicon MPX-1 bypass state."""
        from app.services.juce_engine_service import JuceEngineService
        engine = JuceEngineService()
        bypass = bool(body.get("bypass", False))
        result = await engine.set_lexicon_bypass(bypass)
        return {"success": result, "bypass": bypass}

    @router.post("/lexicon/send-gain")
    async def set_lexicon_send_gain(body: dict = Body(...)):
        """Set Lexicon MPX-1 S/PDIF send gain in dB."""
        from app.services.juce_engine_service import JuceEngineService
        engine = JuceEngineService()
        db = float(body.get("gain_db", 0.0))
        result = await engine.set_lexicon_send_gain(db)
        return {"success": result, "gain_db": db}

    @router.post("/lexicon/return-gain")
    async def set_lexicon_return_gain(body: dict = Body(...)):
        """Set Lexicon MPX-1 S/PDIF return gain in dB."""
        from app.services.juce_engine_service import JuceEngineService
        engine = JuceEngineService()
        db = float(body.get("gain_db", 0.0))
        result = await engine.set_lexicon_return_gain(db)
        return {"success": result, "gain_db": db}

except ImportError:
    router = None
